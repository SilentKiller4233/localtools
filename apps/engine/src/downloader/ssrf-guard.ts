/**
 * SSRF guard (PROJECT_SPEC Section 5.8) for the Media Group C downloader.
 *
 * THE INVARIANT: no user-supplied URL ever reaches an outbound request
 * without passing these checks first — and every redirect hop is checked
 * again by the validating forward proxy, because an attacker-controlled
 * site can redirect a public URL to an internal address.
 *
 * Layers:
 *  1. `assertPublicHttpUrl` — scheme (http/https only) + URL sanity.
 *  2. `resolveAndValidateHost` — DNS resolve, reject loopback/private/
 *     link-local/other non-public ranges (incl. 169.254.169.254).
 *  3. `startValidatingProxy` — a local forward proxy yt-dlp is pointed
 *     at via --proxy. It re-runs layer 2 for EVERY connection yt-dlp
 *     makes (page fetches, format downloads, redirects, fragments), so
 *     redirect-chain attacks die at the first private hop.
 *
 * The proxy is loopback-only (it is the engine's own), never exposed.
 */

import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { URL } from 'node:url';
import { EngineToolError } from '../errors.js';

/* ------------------------------------------------------------------ */
/* IP classification                                                    */
/* ------------------------------------------------------------------ */

/** True for IPv4 literals: any octet non-numeric or >255 → undefined. */
function ipv4ToLong(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) return undefined;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return undefined;
    const v = Number(p);
    if (v > 255) return undefined;
    n = n * 256 + v;
  }
  return n >>> 0;
}

const V4_BLOCKS: ReadonlyArray<readonly [string, number, string]> = [
  // [network, prefix bits, human label]
  ['0.0.0.0', 8, 'this-network'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade-nat'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local (cloud metadata)'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'ietf-protocol'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

function classifyV4(ip: string): { public: boolean; label?: string } {
  const n = ipv4ToLong(ip);
  if (n === undefined) return { public: false, label: 'invalid' };
  if (n === 0xffff_ffff) return { public: false, label: 'broadcast' };
  for (const [base, bits, label] of V4_BLOCKS) {
    const bn = ipv4ToLong(base);
    if (bn === undefined) continue;
    const mask = bits === 0 ? 0 : (0xffff_ffff << (32 - bits)) >>> 0;
    if ((n & mask) >>> 0 === (bn & mask) >>> 0) return { public: false, label };
  }
  return { public: true };
}

function classifyV6(ip: string): { public: boolean; label?: string } {
  const norm = ip.toLowerCase();
  if (norm === '::' || norm === '::1') return { public: false, label: 'loopback' };
  // v4-mapped ::ffff:0:0/96 and v4-compatible ::0.0.0.0/96
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(norm);
  if (mapped !== null) return classifyV4(mapped[1] ?? '');
  if (norm.startsWith('::')) {
    const tail = norm.slice(2);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(tail)) return classifyV4(tail);
  }
  // link-local fe80::/10 — fe8x, fe9x, feax, febx
  if (/^fe[89ab]/.test(norm)) return { public: false, label: 'link-local' };
  // unique-local fc00::/7
  if (norm.startsWith('fc') || norm.startsWith('fd'))
    return { public: false, label: 'unique-local' };
  // multicast ff00::/8
  if (norm.startsWith('ff')) return { public: false, label: 'multicast' };
  // documentation 2001:db8::/32
  if (norm.startsWith('2001:db8')) return { public: false, label: 'documentation' };
  // NAT64 64:ff9b::/96
  if (norm.startsWith('64:ff9b:')) return { public: false, label: 'nat64' };
  return { public: true };
}

/** Classify any IP literal. Returns public=true only for genuinely public IPs. */
export function classifyIp(ip: string): { public: boolean; label?: string } {
  if (ip.includes(':')) return classifyV6(ip);
  return classifyV4(ip);
}

/* ------------------------------------------------------------------ */
/* URL scheme validation (5.8)                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate scheme + basic shape. http/https only — file://, ftp://,
 * data:, gopher://, etc. are rejected before anything else happens.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EngineToolError('invalid-option', 'That doesn’t look like a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EngineToolError('invalid-option', 'Only http:// and https:// links are supported.');
  }
  // A URL without a hostname (e.g. "http:///path") never reaches the network.
  if (url.hostname === '') {
    throw new EngineToolError('invalid-option', 'That doesn’t look like a valid URL.');
  }
  // No embedded credentials — they'd leak into logs and proxies.
  if (url.username !== '' || url.password !== '') {
    throw new EngineToolError('invalid-option', 'URLs with embedded credentials are not accepted.');
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Host resolution + private-range blocking (5.8)                      */
/* ------------------------------------------------------------------ */

export interface ResolvedTarget {
  hostname: string;
  ip: string;
  family: number;
}

/**
 * Resolve a hostname and reject when ANY resolved address is
 * non-public. Dual-stack hosts where one family is fine and the other
 * is private are rejected too (the connection could land on either).
 * Throws blocked-host — the human-facing Section 5.8 error.
 */
export async function resolveAndValidateHost(
  hostname: string,
  _port: number,
): Promise<ResolvedTarget> {
  // Strip IPv6 brackets from WHATWG URL hostnames ("[::1]" → "::1").
  const host =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  // Fast-path: literal IPs skip DNS (also covers hosts dns.lookup would
  // not resolve, like 169.254.169.254 on machines without link-local).
  const literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (literal) {
    const cls = classifyIp(host);
    if (!cls.public) {
      throw new EngineToolError(
        'blocked-host',
        'This link points at a private or local network address, which is not allowed.',
      );
    }
    return { hostname, ip: host, family: host.includes(':') ? 6 : 4 };
  }
  // (host without brackets continues to DNS below)
  if (host !== hostname) {
    return resolveAndValidateHost(host, _port).then((r) => ({ ...r, hostname }));
  }
  // "localhost" and friends resolve to loopback — resolve first so the
  // error classification stays accurate (dns.lookup of 'localhost' works).
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new EngineToolError(
      'unsupported-site',
      'That site can’t be reached — its address can’t be resolved.',
    );
  }
  if (addrs.length === 0) {
    throw new EngineToolError('unsupported-site', 'That site can’t be reached.');
  }
  for (const a of addrs) {
    const cls = classifyIp(a.address);
    if (!cls.public) {
      throw new EngineToolError(
        'blocked-host',
        'This link points at a private or local network address, which is not allowed.',
      );
    }
  }
  const first = addrs[0];
  if (first === undefined) {
    throw new EngineToolError('unsupported-site', 'That site can’t be reached.');
  }
  return { hostname, ip: first.address, family: first.family };
}

/* ------------------------------------------------------------------ */
/* The validating forward proxy                                        */
/* ------------------------------------------------------------------ */

export interface ValidatingProxy {
  /** The URL yt-dlp gets via --proxy. */
  proxyUrl: string;
  /** Live counter of denied (blocked) connections — tests assert on it. */
  deniedCount(): number;
  /** Live counter of allowed connections. */
  allowedCount(): number;
  close(): Promise<void>;
}

export interface ProxyOptions {
  /**
   * The literal `host:port` of the ONE loopback target allowed through
   * (the test mock origin). Any other hostname — including loopback
   * NAMES like `localhost` — falls through to full production
   * validation. Undefined in production.
   */
  mockTarget?: string;
  /** Bind host/port override (defaults: 127.0.0.1, ephemeral). */
  host?: string;
  port?: number;
}

/**
 * Parse a CONNECT request's authority-form target ("host:port" or
 * "[ipv6]:port") into hostname + port. Splitting on ':' mangles IPv6
 * literals (seven colons per address) — WHATWG URL parsing handles both
 * forms and returns the hostname bracket-free. Port defaults to 443
 * (CONNECT is https-only by contract).
 */
export function parseConnectTarget(raw: string): { hostname: string; port: number } {
  let target: URL;
  try {
    target = new URL(`http://${raw}`);
  } catch {
    throw new EngineToolError('invalid-option', 'That doesn’t look like a valid URL.');
  }
  if (target.hostname === '') {
    throw new EngineToolError('invalid-option', 'That doesn’t look like a valid URL.');
  }
  // WHATWG URL keeps brackets in .hostname for IPv6 literals — return
  // the canonical bracket-free form (resolveAndValidateHost accepts
  // both, but the seam comparison and ResolvedTarget.hostname should
  // see one shape).
  const hostname =
    target.hostname.startsWith('[') && target.hostname.endsWith(']')
      ? target.hostname.slice(1, -1)
      : target.hostname;
  return {
    hostname,
    port: target.port === '' ? 443 : Number(target.port),
  };
}

/**
 * Start the validating forward proxy. Every connection yt-dlp makes —
 * initial page fetch, every redirect hop, every media fragment — goes
 * through here and re-validates scheme + resolved IPs. This is the
 * per-hop enforcement the spec demands (5.8).
 */
export function startValidatingProxy(opts: ProxyOptions = {}): Promise<ValidatingProxy> {
  const mockTarget = opts.mockTarget;
  const host = opts.host ?? '127.0.0.1';
  let allowed = 0;
  let denied = 0;

  // Loopback allowance (tests only): exactly ONE host:port — the mock
  // origin — may pass. Everything else, including loopback NAMES, goes
  // through full production validation.
  const checkWithMock = async (hostname: string, port: number): Promise<ResolvedTarget> => {
    if (mockTarget !== undefined && `${hostname}:${String(port)}` === mockTarget) {
      return { hostname, ip: hostname, family: hostname.includes(':') ? 6 : 4 };
    }
    return resolveAndValidateHost(hostname, port);
  };

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const target = new URL(req.url ?? '/');
        if (target.protocol !== 'http:') {
          denied += 1;
          res.writeHead(403, { 'content-type': 'text/plain' });
          res.end('scheme denied');
          return;
        }
        const port = target.port === '' ? 80 : Number(target.port);
        const rv = await checkWithMock(target.hostname, port);
        allowed += 1;
        const headers = { ...req.headers };
        delete headers['proxy-connection'];
        delete headers['proxy-authorization'];
        const upstream = http.request(
          {
            hostname: rv.ip,
            port,
            path: target.pathname + target.search,
            method: req.method,
            headers,
            family: rv.family,
            setHost: false,
            // Preserve the original Host header (absolute-form carries it).
          },
          (ur) => {
            res.writeHead(ur.statusCode ?? 502, ur.headers);
            ur.pipe(res);
          },
        );
        upstream.on('error', () => {
          try {
            res.writeHead(502);
            res.end('upstream error');
          } catch {
            // client gone
          }
        });
        req.pipe(upstream);
      } catch {
        denied += 1;
        try {
          res.writeHead(403, { 'content-type': 'text/plain' });
          res.end('denied');
        } catch {
          // client gone
        }
      }
    })();
  });

  // CONNECT tunneling for https targets (blind tunnel after validation —
  // TLS terminates at yt-dlp; the proxy validates WHO we tunnel to).
  server.on('connect', (req, clientSocket, head) => {
    void (async () => {
      try {
        const { hostname: hostPart, port } = parseConnectTarget(req.url ?? '');
        const rv = await checkWithMock(hostPart, port);
        allowed += 1;
        const upstream = net.connect({ host: rv.ip, port, family: rv.family }, () => {
          clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          upstream.write(head);
          upstream.pipe(clientSocket);
          clientSocket.pipe(upstream);
        });
        upstream.on('error', () => clientSocket.destroy());
        clientSocket.on('error', () => upstream.destroy());
      } catch {
        denied += 1;
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.destroy();
      }
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, host, () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('proxy failed to bind'));
        return;
      }
      resolve({
        proxyUrl: `http://${host}:${String(addr.port)}`,
        deniedCount: () => denied,
        allowedCount: () => allowed,
        close: () => {
          server.closeAllConnections();
          return new Promise<void>((done) => {
            server.close(() => {
              done();
            });
          });
        },
      });
    });
  });
}
