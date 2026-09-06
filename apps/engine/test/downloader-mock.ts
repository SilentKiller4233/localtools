/**
 * Local mock downloader target (PROJECT_SPEC Section 14.2 — the mocked
 * test target; decision recorded in DECISIONS.md D-026).
 *
 * CI never touches live third-party sites. The mock is a plain Node
 * http server on 127.0.0.1 serving yt-dlp-extractable pages:
 *  - /video.html        single <video> page (html5 extractor)
 *  - /two.html         two-video page (playlist shape)
 *  - /evil.html        hostile <title> (traversal + control chars)
 *  - /redir-deny.html  302 → private IP (SSRF redirect test)
 *  - /big.mp4          slow-drip oversized body (size-abort test)
 *  - /subs.html        <track> subtitle page
 *  - /media/*          the actual mp4/srt bytes (committed fixtures)
 *
 * The engine's downloader runs in TEST mode against it:
 *  - extractor set includes generic+html5 so the mock is "supported"
 *  - the validating proxy allows literal loopback
 *  - unsupported-site behavior (zero outbound requests) is asserted with
 *    the PRODUCTION extractor set on the same mock + the hit counter.
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface MockTarget {
  url: string;
  port: number;
  /** Hit log — the SSRF tests assert "no request was made at all". */
  hits(): string[];
  close(): Promise<void>;
}

export async function startMockTarget(): Promise<MockTarget> {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const mp4 = await readFile(resolve(here, '../../../fixtures/media/sample-short.mp4'));
  const srt = await readFile(resolve(here, '../../../fixtures/media/sample.srt')).catch(() =>
    Buffer.from('1\n00:00:00,000 --> 00:00:02,000\nHello mock subtitle\n\n'),
  );

  const hitLog: string[] = [];
  let mockPort = 0;

  const server = http.createServer((req, res) => {
    hitLog.push(`${req.method ?? 'GET'} ${req.url ?? ''}`);
    const path = req.url ?? '';
    const p = path.split('?')[0] ?? '';
    const html = (body: string): void => {
      const b = Buffer.from(body);
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': b.length });
      res.end(b);
    };

    if (p === '/video.html') {
      html(
        '<html><head><title>Cool Video</title></head><body>' +
          '<video src="/media/sample.mp4" controls></video></body></html>',
      );
      return;
    }
    if (p === '/two.html') {
      html(
        '<html><head><title>Two Videos</title></head><body>' +
          '<video src="/media/sample.mp4"></video>' +
          '<video src="/media/sample2.mp4"></video></body></html>',
      );
      return;
    }
    if (p === '/evil.html') {
      html(
        '<html><head><title>..\\..\\pwn &amp; \u0001\u0002ctrl</title></head><body>' +
          '<video src="/media/sample.mp4"></video></body></html>',
      );
      return;
    }
    if (p === '/redir-deny.html') {
      res.writeHead(302, {
        location: 'http://192.168.13.37/media/sample.mp4',
        'content-length': 0,
      });
      res.end();
      return;
    }
    if (p === '/redir-meta.html') {
      // The cloud-metadata endpoint (Section 14.4 names it explicitly).
      res.writeHead(302, {
        location: 'http://169.254.169.254/latest/meta-data/',
        'content-length': 0,
      });
      res.end();
      return;
    }
    if (p === '/redir-loop.html') {
      // Redirect to a NAME that resolves to loopback ('localhost').
      res.writeHead(302, {
        location: `http://localhost:${String(mockPort)}/video.html`,
        'content-length': 0,
      });
      res.end();
      return;
    }
    if (p === '/subs.html') {
      html(
        '<html><head><title>Subbed</title></head><body>' +
          '<video src="/media/sample.mp4"><track src="/media/sample.srt" ' +
          'srclang="en" label="English" kind="subtitles"></video></body></html>',
      );
      return;
    }
    if (p === '/media/sample.srt') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': srt.length });
      res.end(srt);
      return;
    }
    if (p === '/big.mp4') {
      // 1MB drip-fed body: exceeds any small test cap mid-flight.
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': 1024 * 1024 });
      const chunk = mp4.subarray(0, 8192);
      let i = 0;
      const timer = setInterval(() => {
        if (i >= 128) {
          clearInterval(timer);
          res.end();
          return;
        }
        res.write(chunk);
        i += 1;
      }, 20);
      return;
    }
    if (p.startsWith('/media/sample')) {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': mp4.length });
      res.end(mp4);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  return await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('mock target failed to bind'));
        return;
      }
      mockPort = addr.port;
      resolvePromise({
        url: `http://127.0.0.1:${String(addr.port)}`,
        port: addr.port,
        hits: () => [...hitLog],
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
