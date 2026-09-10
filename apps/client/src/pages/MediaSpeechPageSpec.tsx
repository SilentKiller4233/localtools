/**
 * Per-tool page specs for the Phase 9 speech tools (PROJECT_SPEC Section
 * 9 per-tool pattern). Group A (transcribe-media, auto-captions) runs
 * whisper.cpp WASM in the media worker; Group B (text-to-speech,
 * pdf-to-audiobook) POSTs to the engine's Piper endpoints via
 * runEngineTool (same frame/copy discipline as EngineRunnerPage).
 */

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Badge, Button, Card, DropZone, Field, Input, ProgressBar } from '@localtools/ui';
import { PIPER_VOICE_LABELS } from '@localtools/shared-types';
import type { PiperVoiceIdValue } from '@localtools/shared-types';
import { runMediaTool } from '../lib/media-worker-client';
import type { WorkerFileInput } from '../lib/media-worker-client';
import { runEngineTool } from '../lib/engine-client';
import type { EngineClientFile } from '../lib/engine-client';
import { friendlyError } from '../lib/tool-errors';
import { useFakeProgress } from '../hooks/useFakeProgress';
import { ENGINE_DOWN_COPY, useEngineTooling } from '../hooks/useEngineTooling';
import { ToolDownloadPrompt } from './ToolDownloadPrompt';
import { badgeLabel } from '../lib/tool-registry';
import type { RegisteredTool } from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

const AUDIO_ACCEPT = '.wav,audio/wav,audio/x-wav';
const PDF_ACCEPT = 'application/pdf,.pdf';

/** Whisper tiers surfaced in the UI (D-029). */
const TIERS = [
  { id: 'tiny.en', label: 'Fast — tiny (~78MB, first use downloads it)' },
  { id: 'base.en', label: 'Balanced — base (~148MB)' },
  { id: 'small.en', label: 'Most accurate — small (~488MB)' },
] as const;

interface ToolPageSpec {
  tool: RegisteredTool;
}

/** Group A entry (worker tools). */
export function mediaSpeechPage(tool: RegisteredTool): ReactNode | null {
  switch (tool.id) {
    case 'transcribe-media':
      return <TranscribeMediaPage key={tool.id} tool={tool} />;
    case 'auto-captions':
      return <AutoCaptionsPage key={tool.id} tool={tool} />;
    default:
      return null;
  }
}

/** Group B entry (engine tools). */
export function mediaSpeechEnginePage(tool: RegisteredTool): ReactNode | null {
  switch (tool.id) {
    case 'text-to-speech':
      return <TextToSpeechPage key={tool.id} tool={tool} />;
    case 'pdf-to-audiobook':
      return <PdfToAudiobookPage key={tool.id} tool={tool} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                        */
/* ------------------------------------------------------------------ */

function formatBytes(n: number): string {
  if (n < 1024) return `${String(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function download(name: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function OutputList({ outputs }: { outputs: { name: string; bytes: Uint8Array }[] }): ReactNode {
  return (
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
              Download {out.name}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolHeader({
  tool,
  tone,
}: {
  tool: RegisteredTool;
  tone: 'instant' | 'setup';
}): ReactNode {
  return (
    <header className="lt-tool-header">
      <span aria-hidden="true" className="lt-tool-hero-icon">
        <tool.icon size={22} />
      </span>
      <div>
        <h1>{tool.name}</h1>
        <p className="lt-suite-caption">{tool.description}</p>
      </div>
      <Badge tone={tone} dot>
        {badgeLabel(tone === 'instant' ? 'a' : 'b')}
      </Badge>
    </header>
  );
}

/** Voice dropdown shared by both Piper tools. */
function VoiceSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="Voice" htmlFor={id}>
      <select
        id={id}
        className="lt-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {(Object.keys(PIPER_VOICE_LABELS) as PiperVoiceIdValue[]).map((v) => (
          <option key={v} value={v}>
            {PIPER_VOICE_LABELS[v]}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Whisper tier dropdown. */
function TierSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label="Accuracy" htmlFor={id}>
      <select
        id={id}
        className="lt-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {TIERS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ------------------------------------------------------------------ */
/* Group A: transcribe-media (worker)                                   */
/* ------------------------------------------------------------------ */

function TranscribeMediaPage({ tool }: ToolPageSpec) {
  const [fileList, setFileList] = useState<WorkerFileInput[]>([]);
  const [tier, setTier] = useState('tiny.en');
  const [busy, setBusy] = useState(false);
  const fake = useFakeProgress();
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<{ name: string; bytes: Uint8Array }[] | undefined>(
    undefined,
  );

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setOutputs(undefined);
    void (async () => {
      const inputs: WorkerFileInput[] = [];
      for (const file of selected) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(inputs);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy || fileList.length === 0) return;
    setBusy(true);
    fake.start();
    setError(undefined);
    setOutputs(undefined);
    try {
      const raw = (await runMediaTool('transcribe-media', { tier }, fileList)) as { text: string };
      fake.set(100);
      setOutputs([{ name: 'transcript.txt', bytes: new TextEncoder().encode(raw.text) }]);
    } catch (err) {
      setError(friendlyError(err, 'speech', 'The transcription failed. Please try again.'));
    } finally {
      fake.stop();
      setBusy(false);
    }
  }, [busy, fileList, tier, fake]);

  const disabledReason = fileList.length === 0 ? 'Select a WAV file first' : undefined;

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          ← {UI.backToSuite}
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <ToolHeader tool={tool} tone="instant" />
        <Card className="lt-tool-runner">
          <DropZone
            onFilesSelected={onFilesSelected}
            accept={AUDIO_ACCEPT}
            headline="Select a WAV audio file to transcribe offline"
            {...(busy
              ? { state: 'uploading' as const }
              : error !== undefined
                ? { state: 'error' as const }
                : {})}
            {...(fileList.length > 0 ? { hint: `${String(fileList.length)} file selected` } : {})}
          />
          <div className="lt-options">
            <TierSelect id="tm-tier" value={tier} onChange={setTier} />
            <p className="lt-tool-hint">
              The model downloads once on first use, then works fully offline.
            </p>
          </div>
          {busy ? <ProgressBar percent={fake.percent ?? 5} label="Transcribing" /> : null}
          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lt-tool-actions">
            <Button onClick={() => void run()} disabled={busy || disabledReason !== undefined}>
              {busy ? 'Working…' : `Run ${tool.name}`}
            </Button>
            {disabledReason !== undefined && !busy ? (
              <span className="lt-tool-hint">{disabledReason}</span>
            ) : null}
          </div>
          {outputs !== undefined ? <OutputList outputs={outputs} /> : null}
        </Card>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group A: auto-captions (worker)                                      */
/* ------------------------------------------------------------------ */

function AutoCaptionsPage({ tool }: ToolPageSpec) {
  const [fileList, setFileList] = useState<WorkerFileInput[]>([]);
  const [tier, setTier] = useState('tiny.en');
  const [format, setFormat] = useState('srt');
  const [busy, setBusy] = useState(false);
  const fake = useFakeProgress();
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<{ name: string; bytes: Uint8Array }[] | undefined>(
    undefined,
  );

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setOutputs(undefined);
    void (async () => {
      const inputs: WorkerFileInput[] = [];
      for (const file of selected) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(inputs);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy || fileList.length === 0) return;
    setBusy(true);
    fake.start();
    setError(undefined);
    setOutputs(undefined);
    try {
      const raw = (await runMediaTool('auto-captions', { tier, format }, fileList)) as {
        text: string;
        format: string;
      };
      fake.set(100);
      setOutputs([{ name: `captions.${raw.format}`, bytes: new TextEncoder().encode(raw.text) }]);
    } catch (err) {
      setError(friendlyError(err, 'speech', 'The caption generation failed. Please try again.'));
    } finally {
      fake.stop();
      setBusy(false);
    }
  }, [busy, fileList, tier, format, fake]);

  const disabledReason = fileList.length === 0 ? 'Select a WAV file first' : undefined;

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          ← {UI.backToSuite}
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <ToolHeader tool={tool} tone="instant" />
        <Card className="lt-tool-runner">
          <DropZone
            onFilesSelected={onFilesSelected}
            accept={AUDIO_ACCEPT}
            headline="Select a WAV audio file to caption"
            {...(busy
              ? { state: 'uploading' as const }
              : error !== undefined
                ? { state: 'error' as const }
                : {})}
            {...(fileList.length > 0 ? { hint: `${String(fileList.length)} file selected` } : {})}
          />
          <div className="lt-options">
            <Field label="Subtitle format" htmlFor="ac-format">
              <select
                id="ac-format"
                className="lt-input"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value);
                }}
              >
                <option value="srt">SRT — most players</option>
                <option value="vtt">VTT — web standard</option>
              </select>
            </Field>
            <TierSelect id="ac-tier" value={tier} onChange={setTier} />
            <p className="lt-tool-hint">
              The .srt/.vtt feeds straight into Burn Subtitles on a video.
            </p>
          </div>
          {busy ? <ProgressBar percent={fake.percent ?? 5} label="Generating captions" /> : null}
          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lt-tool-actions">
            <Button onClick={() => void run()} disabled={busy || disabledReason !== undefined}>
              {busy ? 'Working…' : `Run ${tool.name}`}
            </Button>
            {disabledReason !== undefined && !busy ? (
              <span className="lt-tool-hint">{disabledReason}</span>
            ) : null}
          </div>
          {outputs !== undefined ? <OutputList outputs={outputs} /> : null}
        </Card>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group B: text-to-speech (engine, options-only)                       */
/* ------------------------------------------------------------------ */

function TextToSpeechPage({ tool }: ToolPageSpec) {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState('en_US-lessac-medium');
  const [speed, setSpeed] = useState('1');
  const [busy, setBusy] = useState(false);
  const fake = useFakeProgress();
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<{ name: string; bytes: Uint8Array }[] | undefined>(
    undefined,
  );
  // Phase 11: health gating + helper-download flow, same as every engine page.
  const eng = useEngineTooling();

  const run = useCallback(async () => {
    if (busy || text.trim() === '') return;
    setBusy(true);
    fake.start();
    setError(undefined);
    eng.clearInstalledNote();
    setOutputs(undefined);
    try {
      if (!(await eng.gate())) {
        setError(ENGINE_DOWN_COPY);
        return;
      }
      // Options-only request: runEngineTool with zero file parts (the
      // engine route is allowNoFiles, like html-to-pdf's inline HTML).
      const files = await runEngineTool(
        '/media/text-to-speech',
        {
          text,
          voice,
          speed: Number(speed) || 1,
        },
        [],
      );
      fake.set(100);
      setOutputs(files.map((f) => ({ name: `${f.name}.${f.ext}`, bytes: f.bytes })));
    } catch (err) {
      if (await eng.handleUnavailable(err, '/media/text-to-speech')) {
        setError(undefined);
        return;
      }
      setError(friendlyError(err, 'engine', 'The speech synthesis failed. Please try again.'));
    } finally {
      fake.stop();
      setBusy(false);
    }
  }, [busy, text, voice, speed, fake, eng]);

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          ← {UI.backToSuite}
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <ToolHeader tool={tool} tone="setup" />
        <Card className="lt-tool-runner">
          {eng.health === 'unreachable' ? (
            <div className="lt-engine-banner lt-engine-banner--down" role="status">
              <p>
                The local processing engine isn’t running. This tool needs it — the rest of the app
                keeps working.
              </p>
              <Button variant="outline" onClick={() => void eng.probe()}>
                Check again
              </Button>
            </div>
          ) : null}
          <div className="lt-options">
            <Field label="Text to speak" htmlFor="tts-text">
              <textarea
                id="tts-text"
                className="lt-input"
                rows={5}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
                placeholder="Type or paste up to 10,000 characters…"
              />
            </Field>
            <VoiceSelect id="tts-voice" value={voice} onChange={setVoice} />
            <Field label="Speed (0.5–2, 1 = natural)" htmlFor="tts-speed">
              <Input
                id="tts-speed"
                type="number"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => {
                  setSpeed(e.target.value);
                }}
              />
            </Field>
          </div>
          {busy ? <ProgressBar percent={fake.percent ?? 5} label="Speaking" /> : null}
          {eng.downloadFor !== undefined ? (
            <ToolDownloadPrompt
              toolId={eng.downloadFor}
              onInstalled={() => {
                eng.setDownloadFor(undefined);
                eng.setInstalledNote('Run');
              }}
              onDismiss={() => {
                eng.setDownloadFor(undefined);
                setError('This tool needs a component that isn’t installed.');
              }}
            />
          ) : null}
          {eng.installedNote !== undefined ? (
            <p className="lt-installed-note" role="status">
              {eng.installedNoteFor(eng.installedNote)}
            </p>
          ) : null}
          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lt-tool-actions">
            <Button onClick={() => void run()} disabled={busy || text.trim() === ''}>
              {busy ? 'Working…' : `Run ${tool.name}`}
            </Button>
            {text.trim() === '' && !busy ? (
              <span className="lt-tool-hint">Enter some text first</span>
            ) : null}
          </div>
          {outputs !== undefined ? <OutputList outputs={outputs} /> : null}
        </Card>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Group B: pdf-to-audiobook (engine, PDF upload)                       */
/* ------------------------------------------------------------------ */

function PdfToAudiobookPage({ tool }: ToolPageSpec) {
  const [fileList, setFileList] = useState<EngineClientFile[]>([]);
  const [voice, setVoice] = useState('en_US-lessac-medium');
  const [speed, setSpeed] = useState('1');
  const [perChapter, setPerChapter] = useState(false);
  const [busy, setBusy] = useState(false);
  const fake = useFakeProgress();
  const [error, setError] = useState<string | undefined>(undefined);
  const [outputs, setOutputs] = useState<{ name: string; bytes: Uint8Array }[] | undefined>(
    undefined,
  );
  // Phase 11: health gating + helper-download flow, same as every engine page.
  const eng = useEngineTooling();

  const onFilesSelected = useCallback((selected: File[]) => {
    setError(undefined);
    setOutputs(undefined);
    void (async () => {
      const inputs: EngineClientFile[] = [];
      for (const file of selected) {
        inputs.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
      setFileList(inputs);
    })();
  }, []);

  const run = useCallback(async () => {
    if (busy || fileList.length === 0) return;
    setBusy(true);
    fake.start();
    setError(undefined);
    eng.clearInstalledNote();
    setOutputs(undefined);
    try {
      if (!(await eng.gate())) {
        setError(ENGINE_DOWN_COPY);
        return;
      }
      const files = await runEngineTool(
        '/media/pdf-to-audiobook',
        {
          file: 0,
          voice,
          speed: Number(speed) || 1,
          perChapter,
        },
        fileList,
      );
      fake.set(100);
      setOutputs(files.map((f) => ({ name: `${f.name}.${f.ext}`, bytes: f.bytes })));
    } catch (err) {
      if (await eng.handleUnavailable(err, '/media/pdf-to-audiobook')) {
        setError(undefined);
        return;
      }
      setError(friendlyError(err, 'engine', 'The audiobook conversion failed. Please try again.'));
    } finally {
      fake.stop();
      setBusy(false);
    }
  }, [busy, fileList, voice, speed, perChapter, fake, eng]);

  const disabledReason = fileList.length === 0 ? 'Select a PDF first' : undefined;

  return (
    <div className="lt-page">
      <nav aria-label="Breadcrumb" className="lt-breadcrumb">
        <a href={`#/suite/${tool.suite}`} className="lt-crumb-link">
          ← {UI.backToSuite}
        </a>
      </nav>
      <main className="lt-main lt-tool-page">
        <ToolHeader tool={tool} tone="setup" />
        <Card className="lt-tool-runner">
          {eng.health === 'unreachable' ? (
            <div className="lt-engine-banner lt-engine-banner--down" role="status">
              <p>
                The local processing engine isn’t running. This tool needs it — the rest of the app
                keeps working.
              </p>
              <Button variant="outline" onClick={() => void eng.probe()}>
                Check again
              </Button>
            </div>
          ) : null}
          <DropZone
            onFilesSelected={onFilesSelected}
            accept={PDF_ACCEPT}
            headline="Select a text PDF to read aloud"
            {...(busy
              ? { state: 'uploading' as const }
              : error !== undefined
                ? { state: 'error' as const }
                : {})}
            {...(fileList.length > 0
              ? {
                  hint: fileList
                    .map((f) => `${f.name} (${formatBytes(f.bytes.byteLength)})`)
                    .join(', '),
                }
              : {})}
          />
          <div className="lt-options">
            <VoiceSelect id="ab-voice" value={voice} onChange={setVoice} />
            <Field label="Speed (0.5–2, 1 = natural)" htmlFor="ab-speed">
              <Input
                id="ab-speed"
                type="number"
                min={0.5}
                max={2}
                step={0.1}
                value={speed}
                onChange={(e) => {
                  setSpeed(e.target.value);
                }}
              />
            </Field>
            <label htmlFor="ab-perchapter" className="lt-tool-hint">
              <input
                id="ab-perchapter"
                type="checkbox"
                checked={perChapter}
                onChange={(e) => {
                  setPerChapter(e.target.checked);
                }}
              />{' '}
              One file per chapter (uses the PDF outline)
            </label>
          </div>
          {busy ? <ProgressBar percent={fake.percent ?? 5} label="Reading aloud" /> : null}
          {eng.downloadFor !== undefined ? (
            <ToolDownloadPrompt
              toolId={eng.downloadFor}
              onInstalled={() => {
                eng.setDownloadFor(undefined);
                eng.setInstalledNote('Run');
              }}
              onDismiss={() => {
                eng.setDownloadFor(undefined);
                setError('This tool needs a component that isn’t installed.');
              }}
            />
          ) : null}
          {eng.installedNote !== undefined ? (
            <p className="lt-installed-note" role="status">
              {eng.installedNoteFor(eng.installedNote)}
            </p>
          ) : null}
          {error !== undefined ? (
            <p className="lt-tool-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="lt-tool-actions">
            <Button onClick={() => void run()} disabled={busy || disabledReason !== undefined}>
              {busy ? 'Working…' : `Run ${tool.name}`}
            </Button>
            {disabledReason !== undefined && !busy ? (
              <span className="lt-tool-hint">{disabledReason}</span>
            ) : null}
          </div>
          {outputs !== undefined ? <OutputList outputs={outputs} /> : null}
        </Card>
      </main>
    </div>
  );
}
