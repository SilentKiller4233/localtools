/**
 * Piper voice model management (PROJECT_SPEC Phase 9, DECISIONS.md D-030).
 *
 * Voices are .onnx + .onnx.json pairs from rhasspy/piper-voices on
 * Hugging Face (repo-wide MIT). They are NOT committed: each voice is
 * lazy-downloaded on first use into a local cache (the u2netp precedent,
 * D-016) and verified against a pinned SHA-256 before it is ever passed
 * to Piper. A failed/absent download surfaces as the Section 13
 * retry-able tool-unavailable variant with model-download-failed copy —
 * the engine reaches for the network ONLY for these pinned HF files.
 *
 * Adding a voice = ONE row in VOICES below (HF path + pinned SHA-256s +
 * display label already lives in shared-types' PIPER_VOICE_LABELS).
 * Record the digests from the HF LFS API (onnx) and a local
 * `curl | sha256sum` (json — it is a plain git blob, not LFS).
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PiperVoiceIdValue } from '@localtools/shared-types';
import { EngineToolError } from '../errors.js';

/** One pinned voice artifact pair. */
interface VoiceArtifact {
  /** HF repo path dir, e.g. en/en_US/lessac/medium */
  hfDir: string;
  /** SHA-256 of the .onnx (the HF LFS oid). */
  onnxSha256: string;
  /** SHA-256 of the .onnx.json config (git blob — computed, not an oid). */
  jsonSha256: string;
}

/**
 * Curated v1 voice list (D-030). All `medium` quality (~63MB, 22050Hz).
 * Digests verified live 2026-09-07 (onnx via the HF tree API LFS oid;
 * json via download + sha256sum).
 */
const VOICES: Readonly<Record<PiperVoiceIdValue, VoiceArtifact>> = {
  'en_US-lessac-medium': {
    hfDir: 'en/en_US/lessac/medium',
    onnxSha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f',
    jsonSha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0',
  },
  'en_US-amy-medium': {
    hfDir: 'en/en_US/amy/medium',
    onnxSha256: 'b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18',
    jsonSha256: '95a23eb4d42909d38df73bb9ac7f45f597dbfcde2d1bf9526fdeaf5466977d77',
  },
  'en_GB-alba-medium': {
    hfDir: 'en/en_GB/alba/medium',
    onnxSha256: '401369c4a81d09fdd86c32c5c864440811dbdcc66466cde2d64f7133a66ad03b',
    jsonSha256: 'aa965a2f02ecced632c2694e1fc72bbff6d65f265fab567ca945918c73dd89f4',
  },
};

const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

/** Voice cache dir: LOCALTOOLS_VOICE_DIR override, else the shared model cache. */
export function voiceDir(): string {
  const override = process.env['LOCALTOOLS_VOICE_DIR'];
  if (override !== undefined && override !== '') return override;
  return join(tmpdir(), 'localtools-models', 'piper-voices');
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Download one file to a temp path, verify its digest, move it into place. */
async function fetchVerified(url: string, destPath: string, expectedSha256: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new EngineToolError(
      'tool-unavailable',
      'The voice model could not be downloaded. Check your connection and retry.',
    );
  }
  if (!res.ok) {
    throw new EngineToolError(
      'tool-unavailable',
      'The voice model could not be downloaded. Check your connection and retry.',
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== expectedSha256) {
    throw new EngineToolError(
      'tool-unavailable',
      'The voice download failed its integrity check. Retry in a moment.',
    );
  }
  // Write + verify + atomic rename: a partial cache never passes the gate.
  const staging = `${destPath}.${String(Date.now())}.part`;
  await writeFile(staging, bytes);
  await rename(staging, destPath);
}

/**
 * Resolve a voice to its on-disk pair, downloading lazily when missing.
 * The digest check covers BOTH first download and any pre-existing cache
 * file (a corrupted cache fails closed → retry clears it via redownload).
 */
export async function ensureVoice(
  voice: PiperVoiceIdValue,
): Promise<{ onnx: string; json: string }> {
  const artifact = VOICES[voice];
  const dir = voiceDir();
  const onnx = join(dir, `${voice}.onnx`);
  const json = `${onnx}.json`;

  const onnxOk = await fileMatches(onnx, artifact.onnxSha256);
  const jsonOk = await fileMatches(json, artifact.jsonSha256);
  if (!onnxOk || !jsonOk) {
    await mkdir(dir, { recursive: true });
    // A truncated cache file fails the digest gate on every attempt until
    // replaced, which fetchVerified's atomic rename guarantees on success.
    if (!onnxOk)
      await fetchVerified(`${HF_BASE}/${artifact.hfDir}/${voice}.onnx`, onnx, artifact.onnxSha256);
    if (!jsonOk)
      await fetchVerified(
        `${HF_BASE}/${artifact.hfDir}/${voice}.onnx.json`,
        json,
        artifact.jsonSha256,
      );
  }
  return { onnx, json };
}

/** True when path exists AND its SHA-256 matches the pinned digest. */
async function fileMatches(path: string, expected: string): Promise<boolean> {
  try {
    if (!existsSync(path)) return false;
    const bytes = await readFile(path);
    return sha256(new Uint8Array(bytes)) === expected;
  } catch {
    return false;
  }
}

/** Test seam: the pinned table (unit tests assert all three rows exist). */
export function voiceTableForTests(): Readonly<Record<string, VoiceArtifact>> {
  return VOICES;
}

// ensureVoice is exported above; tests import it directly as the
// lazy-download retry seam.
