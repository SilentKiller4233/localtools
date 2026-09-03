/**
 * Engine runtime configuration (PROJECT_SPEC Section 5 + .env.example).
 *
 * Every value is overridable via LOCALTOOLS_* env vars (see .env.example);
 * defaults are the safe loopback-only posture from Section 5.1.
 */

function envBool(name: string, def: false): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export interface EngineConfig {
  /** Bind address. 127.0.0.1 unless LOCALTOOLS_EXPOSE=true. */
  host: string;
  port: number;
  /** True only when LOCALTOOLS_EXPOSE=true AND token >= 32 chars (5.1). */
  exposed: boolean;
  /** Bearer token required when exposed. */
  authToken: string | undefined;
  /** Exact allowed browser origin for CORS (never a wildcard). */
  clientOrigin: string;
  /** Per-file byte cap (Section 5.2; default 500MB per Section 8). */
  maxFileSize: number;
  /** Total-request byte cap across all files (Section 5.2). */
  maxRequestSize: number;
  /** File-op subprocess timeout seconds (Section 5.2 default 60s). */
  fileTimeoutSeconds: number;
  /** Max concurrent subprocess invocations before 429 (Section 5.2/13). */
  maxConcurrentSubprocesses: number;
}

export function loadConfig(): EngineConfig {
  const exposeRequested = envBool('LOCALTOOLS_EXPOSE', false);
  const token = process.env['LOCALTOOLS_AUTH_TOKEN'] ?? '';
  // Section 5.1: exposing requires a token >= 32 chars — refuse to boot
  // otherwise. This check happens at config load (i.e. boot time).
  const exposed = exposeRequested && token.length >= 32;
  if (exposeRequested && !exposed) {
    throw new Error(
      'LOCALTOOLS_EXPOSE=true requires LOCALTOOLS_AUTH_TOKEN of at least 32 characters — refusing to start.',
    );
  }
  return {
    // LOCALTOOLS_ENGINE_HOST lets the Docker container bind 0.0.0.0 inside
    // its namespace; the host-side loopback guarantee (Section 5.1) is
    // enforced by compose's `127.0.0.1:8787:8787` port mapping, not by the
    // in-container bind. Default stays loopback for dev machines/sidecars.
    host: process.env['LOCALTOOLS_ENGINE_HOST'] ?? (exposed ? '0.0.0.0' : '127.0.0.1'),
    port: envInt('LOCALTOOLS_ENGINE_PORT', 8787),
    exposed,
    authToken: exposed ? token : undefined,
    clientOrigin: process.env['LOCALTOOLS_CLIENT_ORIGIN'] ?? 'http://localhost:5173',
    maxFileSize: envInt('LOCALTOOLS_MAX_FILE_SIZE', 524_288_000),
    maxRequestSize: envInt('LOCALTOOLS_MAX_REQUEST_SIZE', 1_073_741_824),
    fileTimeoutSeconds: envInt('LOCALTOOLS_FILE_TIMEOUT_SECONDS', 60),
    maxConcurrentSubprocesses: envInt('LOCALTOOLS_MAX_CONCURRENT_SUBPROCESSES', 2),
  };
}

/** Test seam: build a config directly without touching process.env. */
export function testConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    exposed: false,
    authToken: undefined,
    clientOrigin: 'http://localhost:5173',
    maxFileSize: 524_288_000,
    maxRequestSize: 1_073_741_824,
    fileTimeoutSeconds: 60,
    maxConcurrentSubprocesses: 2,
    ...overrides,
  };
}
