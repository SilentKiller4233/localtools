/**
 * Universal Downloader page (PROJECT_SPEC Phase 8, Section 3.2 Group C).
 *
 * URL-input flow (NOT the drop-zone pattern — this is a URL tool):
 *  1. One-time dismissible legal notice on first open (Section 6,
 *     in-app notice — Phase 8 scope; persisted in localStorage).
 *  2. Paste a link → POST /downloader/metadata → preview card
 *     (title, uploader, duration, thumbnail) BEFORE any download.
 *  3. Format/quality picker from the reported formats; audio-only and
 *     subtitle options; playlist entries selectable into a per-item
 *     queue.
 *  4. POST /downloader/download → progress → result downloads.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Field, Input, ProgressBar } from '@localtools/ui';
import { isEngineCallError, runEngineJson } from '../lib/engine-client';
import { badgeLabel } from '../lib/tool-registry';
import type { RegisteredTool } from '../lib/tool-registry';
import type {
  DownloadFormat,
  DownloadItem,
  DownloadMetadataResponse,
} from '@localtools/shared-types';

const LEGAL_SEEN_KEY = 'localtools.downloader.legal-seen.v1';

interface PlaylistEntryMeta {
  itemId: string;
  title: string;
  uploader: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
}

interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

export function DownloaderPage({ tool }: { tool: RegisteredTool }) {
  const [legalOpen, setLegalOpen] = useState(true);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<DownloadMetadataResponse | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [formatId, setFormatId] = useState<string>('best');
  const [wantAudio, setWantAudio] = useState(false);
  const [audioFormat, setAudioFormat] = useState('mp3');
  const [wantSubs, setWantSubs] = useState(false);
  const [subLang, setSubLang] = useState('en');
  const [queue, setQueue] = useState<number[]>([]); // playlist indexes (1-based items)
  const [outputs, setOutputs] = useState<OutputFile[] | undefined>(undefined);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LEGAL_SEEN_KEY) === '1') setLegalOpen(false);
    } catch {
      // private mode — notice shows again; harmless
    }
  }, []);

  const dismissLegal = useCallback(() => {
    setLegalOpen(false);
    try {
      window.localStorage.setItem(LEGAL_SEEN_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const previewUrl = useCallback(async () => {
    if (previewing || url.trim() === '') return;
    setPreviewing(true);
    setError(undefined);
    setPreview(undefined);
    setOutputs(undefined);
    setQueue([]);
    try {
      const data = await runEngineJson<DownloadMetadataResponse>('/downloader/metadata', {
        url: url.trim(),
      });
      setPreview(data);
      setFormatId(data.item.formats.length > 0 ? 'best' : 'best');
    } catch (err) {
      setError(engineMessage(err));
    } finally {
      setPreviewing(false);
    }
  }, [previewing, url]);

  const run = useCallback(async () => {
    if (downloading || preview === undefined) return;
    setDownloading(true);
    setProgress(5);
    const ticker = setInterval(() => {
      setProgress((p) => (p === undefined ? 5 : Math.min(90, p + 4)));
    }, 500);
    try {
      const body: Record<string, unknown> = {
        url: url.trim(),
        mode: wantAudio ? 'audio' : formatId === 'best' ? 'best' : 'format',
      };
      if (!wantAudio && formatId !== 'best') body['formatId'] = formatId;
      if (queue.length > 0) body['items'] = queue;
      if (wantAudio) body['audioFormat'] = audioFormat;
      if (wantSubs) body['subtitleLangs'] = [subLang];
      const data = await runEngineJson<{ files: { name: string; ext: string; data: string }[] }>(
        '/downloader/download',
        body,
      );
      setProgress(100);
      setOutputs(data.files.map((f) => ({ name: f.name, bytes: decodeB64(f.data) })));
    } catch (err) {
      setError(engineMessage(err));
    } finally {
      clearInterval(ticker);
      setDownloading(false);
      setProgress(undefined);
    }
  }, [downloading, preview, url, wantAudio, formatId, queue, wantSubs, subLang, audioFormat]);

  const entries: PlaylistEntryMeta[] = preview?.entries ?? [];
  const item: DownloadItem | undefined = preview?.item;

  const formats: DownloadFormat[] = useMemo(
    () => item?.formats.filter((f) => f.hasVideo || f.hasAudio) ?? [],
    [item],
  );

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href="#/suite/media" className="lt-crumb-link">
          ← All tools
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <header className="lt-tool-header">
          <span aria-hidden="true" className="lt-tool-hero-icon">
            <tool.icon size={22} />
          </span>
          <div>
            <h1>{tool.name}</h1>
            <p className="lt-suite-caption">{tool.description}</p>
          </div>
          <Badge tone="setup" dot>
            {badgeLabel(tool.group)}
          </Badge>
        </header>

        {legalOpen ? (
          <Card className="lt-legal-notice" role="region" aria-label="Usage notice">
            <h2>Before you download — please read</h2>
            <ul>
              <li>
                This tool works like long-established open-source downloaders (yt-dlp, gallery-dl).
                It doesn’t circumvent DRM — it downloads content already served to any visitor’s
                browser.
              </li>
              <li>
                Many platforms’ Terms of Service restrict downloading even without DRM — using this
                tool may violate the ToS of the site you download from. That’s your responsibility
                to consider.
              </li>
              <li>
                Good uses: your own uploads, Creative Commons / public-domain content, personal
                offline viewing of content you have the right to access, and archival or educational
                uses consistent with your local copyright law.
              </li>
              <li>
                Copyright law and platform rules vary by country and platform. The app can’t advise
                you — you’re responsible for complying with both.
              </li>
            </ul>
            <Button onClick={dismissLegal}>Got it — continue</Button>
          </Card>
        ) : null}

        <Card className="lt-tool-runner">
          <Field label="Paste a link from any supported site" htmlFor="dl-url">
            <Input
              id="dl-url"
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
              }}
            />
          </Field>
          <div className="lt-tool-actions">
            <Button onClick={() => void previewUrl()} disabled={previewing || url.trim() === ''}>
              {previewing ? 'Checking…' : 'Preview'}
            </Button>
          </div>

          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}

          {preview !== undefined && item !== undefined ? (
            <section className="lt-dl-preview" aria-label="Preview">
              <h2>{item.title}</h2>
              <p className="lt-suite-caption">
                {[
                  item.uploader ?? 'unknown uploader',
                  item.durationSeconds !== null ? formatDur(item.durationSeconds) : null,
                  item.extractor ?? null,
                ]
                  .filter((x) => x !== null)
                  .join(' · ')}
              </p>

              <div className="lt-options">
                <Field label="Quality" htmlFor="dl-format">
                  <select
                    id="dl-format"
                    className="lt-input"
                    value={wantAudio ? 'audio' : formatId}
                    onChange={(e) => {
                      if (e.target.value === 'audio') {
                        setWantAudio(true);
                      } else {
                        setWantAudio(false);
                        setFormatId(e.target.value);
                      }
                    }}
                  >
                    <option value="best">Best available</option>
                    {formats.map((f) => (
                      <option key={f.formatId} value={f.formatId}>
                        {f.label} ({f.ext})
                      </option>
                    ))}
                    <option value="audio">Audio only</option>
                  </select>
                </Field>

                {wantAudio ? (
                  <Field label="Audio format" htmlFor="dl-audio">
                    <select
                      id="dl-audio"
                      className="lt-input"
                      value={audioFormat}
                      onChange={(e) => {
                        setAudioFormat(e.target.value);
                      }}
                    >
                      {['mp3', 'm4a', 'flac', 'ogg', 'wav'].map((f) => (
                        <option key={f} value={f}>
                          {f.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                {item.subtitleLangs.length > 0 ? (
                  <Field label="Subtitles" htmlFor="dl-subs">
                    <select
                      id="dl-subs"
                      className="lt-input"
                      value={wantSubs ? subLang : ''}
                      onChange={(e) => {
                        setWantSubs(e.target.value !== '');
                        setSubLang(e.target.value || 'en');
                      }}
                    >
                      <option value="">No subtitles</option>
                      {item.subtitleLangs.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>

              {entries.length > 0 ? (
                <div className="lt-dl-queue">
                  <p className="lt-tool-hint">
                    Playlist — pick items to download (none selected = first item):
                  </p>
                  <ul className="lt-file-list" aria-label="Playlist items">
                    {entries.map((e, i) => (
                      <li key={e.itemId}>
                        <label>
                          <input
                            type="checkbox"
                            checked={queue.includes(i + 1)}
                            onChange={(ev) => {
                              setQueue((q) =>
                                ev.target.checked
                                  ? [...q, i + 1].sort((a, b) => a - b)
                                  : q.filter((n) => n !== i + 1),
                              );
                            }}
                          />{' '}
                          {String(i + 1)}. {e.title}
                          {e.durationSeconds !== null ? ` (${formatDur(e.durationSeconds)})` : ''}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {downloading ? <ProgressBar percent={progress ?? 5} label="Downloading" /> : null}

              <div className="lt-tool-actions">
                <Button onClick={() => void run()} disabled={downloading}>
                  {downloading ? 'Downloading…' : 'Download'}
                </Button>
              </div>
            </section>
          ) : null}

          {outputs !== undefined && outputs.length > 0 ? (
            <section className="lt-tool-result" aria-label="Result">
              <h2>Result</h2>
              <ul className="lt-output-list">
                {outputs.map((out, i) => (
                  <li key={`${out.name}-${String(i)}`}>
                    <Button
                      variant="outline"
                      onClick={() => {
                        download(out.name, out.bytes);
                      }}
                    >
                      Save {out.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </Card>
      </main>
    </div>
  );
}

function engineMessage(err: unknown): string {
  return isEngineCallError(err) ? err.message : 'The operation failed. Please try again.';
}

function formatDur(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${String(h)}h ${String(m % 60)}m`;
  return `${String(m)}m ${String(s % 60)}s`;
}

function decodeB64(data: string): Uint8Array {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const urlStr = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = urlStr;
  a.download = name;
  a.click();
  URL.revokeObjectURL(urlStr);
}
