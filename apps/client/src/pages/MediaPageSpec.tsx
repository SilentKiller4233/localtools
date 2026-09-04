/**
 * Per-tool page specs for the 14 Media Group B tools (PROJECT_SPEC Phase 7,
 * Section 9 per-tool pattern). Every page = EngineRunnerPage (engine POST,
 * progress, human-readable errors) + an options panel of shared controls.
 * buildOptions() serializes the panel into the endpoint's zod-validated
 * request body — the same schemas shared with the engine.
 *
 * The ffmpeg.wasm small-clip browser path (Section 3.2 Group A) is
 * deliberately deferred (DECISIONS.md D-021): all media conversion
 * currently routes through the engine path; the 50MB threshold UI is
 * not built yet.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Field, Input } from '@localtools/ui';
import { EngineRunnerPage } from './EngineRunnerPage';
import type { RegisteredTool } from '../lib/tool-registry';

const VIDEO_ACCEPT = '.mp4,.webm,.mov,.mkv,.avi,.m4v,video/*';
const AUDIO_ACCEPT = '.mp3,.wav,.flac,.ogg,.aac,.m4a,audio/*';
const SUBTITLE_ACCEPT = '.srt,.vtt';

/** Select-style option row (same look as the PDF pages' lt-options). */
function Select({
  label,
  id,
  value,
  onChange,
  children,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="lt-input"
        id={id}
      >
        {children}
      </select>
    </Field>
  );
}

interface ToolPageSpec {
  tool: RegisteredTool;
}

export function mediaToolPage(tool: RegisteredTool): ReactNode {
  switch (tool.id) {
    case 'video-converter':
      return <VideoConvertPage key={tool.id} tool={tool} />;
    case 'video-compressor':
      return <VideoCompressPage key={tool.id} tool={tool} />;
    case 'video-trimmer':
      return <VideoTrimPage key={tool.id} tool={tool} />;
    case 'video-merger':
      return <MediaMergePage key={tool.id} tool={tool} />;
    case 'extract-audio':
      return <ExtractAudioPage key={tool.id} tool={tool} />;
    case 'video-to-gif':
      return <VideoToGifPage key={tool.id} tool={tool} />;
    case 'gif-to-video':
      return <GifToVideoPage key={tool.id} tool={tool} />;
    case 'audio-converter':
      return <AudioConvertPage key={tool.id} tool={tool} />;
    case 'audio-compressor':
      return <AudioCompressPage key={tool.id} tool={tool} />;
    case 'audio-trimmer':
      return <AudioTrimPage key={tool.id} tool={tool} />;
    case 'loudness-normalizer':
      return <LoudnessNormalizePage key={tool.id} tool={tool} />;
    case 'burn-subtitles':
      return <BurnSubtitlesPage key={tool.id} tool={tool} />;
    case 'resolution-changer':
      return <ResolutionChangePage key={tool.id} tool={tool} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */

function VideoConvertPage({ tool }: ToolPageSpec) {
  const [container, setContainer] = useState('mp4');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to convert"
      optionsPanel={
        <div className="lt-options">
          <Select label="Output format" id="vc-container" value={container} onChange={setContainer}>
            <option value="mp4">MP4 — most compatible</option>
            <option value="webm">WebM — VP9, web-native</option>
            <option value="mov">MOV — QuickTime</option>
            <option value="mkv">MKV — Matroska</option>
            <option value="avi">AVI — legacy</option>
          </Select>
        </div>
      }
      endpoint="/media/video-convert"
      buildOptions={() => ({ file: 0, container })}
    />
  );
}

function VideoCompressPage({ tool }: ToolPageSpec) {
  const [preset, setPreset] = useState('balanced');
  const [bitrate, setBitrate] = useState('');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to compress"
      optionsPanel={
        <div className="lt-options">
          <Select label="Quality" id="vcomp-preset" value={preset} onChange={setPreset}>
            <option value="small">Small — strongest compression</option>
            <option value="balanced">Balanced — recommended</option>
            <option value="high-quality">High quality — gentle</option>
          </Select>
          <Field label="Max bitrate (kbps, optional)" htmlFor="vcomp-br">
            <Input
              id="vcomp-br"
              type="number"
              min={0}
              value={bitrate}
              onChange={(e) => {
                setBitrate(e.target.value);
              }}
              placeholder="e.g. 1500 — leave empty for no cap"
            />
          </Field>
        </div>
      }
      endpoint="/media/video-compress"
      buildOptions={() => ({
        file: 0,
        preset,
        maxBitrateKbps: bitrate === '' ? 0 : Number(bitrate),
      })}
    />
  );
}

function VideoTrimPage({ tool }: ToolPageSpec) {
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState('lossless');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to cut a clip from"
      optionsPanel={
        <div className="lt-options">
          <Select label="Cut mode" id="vtrim-mode" value={mode} onChange={setMode}>
            <option value="lossless">Lossless — instant, cuts on keyframes</option>
            <option value="reencode">Re-encode — exact cut points</option>
          </Select>
          <Field label="Start (seconds or HH:MM:SS)" htmlFor="vtrim-start">
            <Input
              id="vtrim-start"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
              }}
            />
          </Field>
          <Field label="End (optional)" htmlFor="vtrim-end">
            <Input
              id="vtrim-end"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
              }}
              placeholder="seconds or HH:MM:SS — leave empty to keep the rest"
            />
          </Field>
        </div>
      }
      endpoint="/media/video-trim"
      buildOptions={() => {
        const opts: Record<string, unknown> = {
          file: 0,
          start: start === '' ? 0 : Number.isNaN(Number(start)) ? start : Number(start),
          mode,
        };
        if (end !== '') opts['end'] = end;
        return opts;
      }}
    />
  );
}

function MediaMergePage({ tool }: ToolPageSpec) {
  const [kind, setKind] = useState<'video' | 'audio'>('video');
  const [container, setContainer] = useState('mp4');
  const isVideo = kind === 'video';
  return (
    <EngineRunnerPage
      tool={tool}
      accept={isVideo ? VIDEO_ACCEPT : AUDIO_ACCEPT}
      hint={
        isVideo ? 'Select the videos to join, in order' : 'Select the audio files to join, in order'
      }
      multiple
      optionsPanel={
        <div className="lt-options">
          <Select
            label="Merge type"
            id="mmerge-kind"
            value={kind}
            onChange={(v) => {
              setKind(v === 'audio' ? 'audio' : 'video');
            }}
          >
            <option value="video">Videos → one video</option>
            <option value="audio">Audio files → one audio</option>
          </Select>
          {isVideo ? (
            <Select
              label="Output format"
              id="mmerge-container"
              value={container}
              onChange={setContainer}
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="mov">MOV</option>
              <option value="mkv">MKV</option>
              <option value="avi">AVI</option>
            </Select>
          ) : null}
        </div>
      }
      endpoint="/media/media-merge"
      buildOptions={(fileCount) => ({
        files: Array.from({ length: fileCount }, (_, i) => i),
        kind,
        ...(isVideo ? { container } : {}),
      })}
    />
  );
}

function ExtractAudioPage({ tool }: ToolPageSpec) {
  const [format, setFormat] = useState('mp3');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to pull the audio track from"
      optionsPanel={
        <div className="lt-options">
          <Select label="Audio format" id="ea-format" value={format} onChange={setFormat}>
            <option value="mp3">MP3</option>
            <option value="wav">WAV — uncompressed</option>
            <option value="flac">FLAC — lossless</option>
            <option value="ogg">Ogg Vorbis</option>
            <option value="aac">AAC</option>
            <option value="m4a">M4A</option>
          </Select>
        </div>
      }
      endpoint="/media/extract-audio"
      buildOptions={() => ({ file: 0, format })}
    />
  );
}

function VideoToGifPage({ tool }: ToolPageSpec) {
  const [width, setWidth] = useState('480');
  const [fps, setFps] = useState('12');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to turn into an animated GIF"
      optionsPanel={
        <div className="lt-options">
          <Field label="Width (px)" htmlFor="v2g-width">
            <Input
              id="v2g-width"
              type="number"
              min={16}
              max={2160}
              value={width}
              onChange={(e) => {
                setWidth(e.target.value);
              }}
            />
          </Field>
          <Field label="Frame rate (fps)" htmlFor="v2g-fps">
            <Input
              id="v2g-fps"
              type="number"
              min={1}
              max={30}
              value={fps}
              onChange={(e) => {
                setFps(e.target.value);
              }}
            />
          </Field>
        </div>
      }
      endpoint="/media/video-to-gif"
      buildOptions={() => ({ file: 0, width: Number(width) || 480, fps: Number(fps) || 12 })}
    />
  );
}

function GifToVideoPage({ tool }: ToolPageSpec) {
  const [container, setContainer] = useState('mp4');
  return (
    <EngineRunnerPage
      tool={tool}
      accept=".gif,image/gif"
      hint="Select a GIF to convert to video"
      optionsPanel={
        <div className="lt-options">
          <Select
            label="Output format"
            id="g2v-container"
            value={container}
            onChange={setContainer}
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
            <option value="mkv">MKV</option>
            <option value="avi">AVI</option>
          </Select>
        </div>
      }
      endpoint="/media/gif-to-video"
      buildOptions={() => ({ file: 0, container })}
    />
  );
}

function AudioConvertPage({ tool }: ToolPageSpec) {
  const [format, setFormat] = useState('mp3');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={AUDIO_ACCEPT}
      hint="Select an audio file to convert"
      optionsPanel={
        <div className="lt-options">
          <Select label="Output format" id="ac-format" value={format} onChange={setFormat}>
            <option value="mp3">MP3</option>
            <option value="wav">WAV — uncompressed</option>
            <option value="flac">FLAC — lossless</option>
            <option value="ogg">Ogg Vorbis</option>
            <option value="aac">AAC</option>
            <option value="m4a">M4A</option>
          </Select>
        </div>
      }
      endpoint="/media/audio-convert"
      buildOptions={() => ({ file: 0, format })}
    />
  );
}

function AudioCompressPage({ tool }: ToolPageSpec) {
  const [bitrate, setBitrate] = useState('96');
  const [format, setFormat] = useState('mp3');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={AUDIO_ACCEPT}
      hint="Select an audio file to shrink"
      optionsPanel={
        <div className="lt-options">
          <Field label="Target bitrate (kbps)" htmlFor="acomp-br">
            <Input
              id="acomp-br"
              type="number"
              min={8}
              max={320}
              value={bitrate}
              onChange={(e) => {
                setBitrate(e.target.value);
              }}
            />
          </Field>
          <Select label="Output format" id="acomp-format" value={format} onChange={setFormat}>
            <option value="mp3">MP3</option>
            <option value="aac">AAC</option>
            <option value="ogg">Ogg Vorbis</option>
          </Select>
        </div>
      }
      endpoint="/media/audio-compress"
      buildOptions={() => ({ file: 0, bitrateKbps: Number(bitrate) || 96, format })}
    />
  );
}

function AudioTrimPage({ tool }: ToolPageSpec) {
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={AUDIO_ACCEPT}
      hint="Select an audio file to cut a range from"
      optionsPanel={
        <div className="lt-options">
          <Field label="Start (seconds or HH:MM:SS)" htmlFor="atrim-start">
            <Input
              id="atrim-start"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
              }}
            />
          </Field>
          <Field label="End (optional)" htmlFor="atrim-end">
            <Input
              id="atrim-end"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
              }}
              placeholder="leave empty to keep the rest"
            />
          </Field>
        </div>
      }
      endpoint="/media/audio-trim"
      buildOptions={() => {
        const opts: Record<string, unknown> = {
          file: 0,
          start: start === '' ? 0 : Number.isNaN(Number(start)) ? start : Number(start),
        };
        if (end !== '') opts['end'] = end;
        return opts;
      }}
    />
  );
}

function LoudnessNormalizePage({ tool }: ToolPageSpec) {
  const [target, setTarget] = useState('-16');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={`${VIDEO_ACCEPT},${AUDIO_ACCEPT}`}
      hint="Select an audio file or a video to normalize loudness (EBU R128)"
      optionsPanel={
        <div className="lt-options">
          <Field label="Target loudness (LUFS)" htmlFor="ln-target">
            <Input
              id="ln-target"
              type="number"
              min={-60}
              max={-5}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
              }}
            />
          </Field>
          <p className="lt-tool-hint">
            −16 LUFS suits most online video; −14 is common for podcasts.
          </p>
        </div>
      }
      endpoint="/media/loudness-normalize"
      buildOptions={() => ({ file: 0, targetLufs: Number(target) || -16 })}
    />
  );
}

function BurnSubtitlesPage({ tool }: ToolPageSpec) {
  // EngineRunnerPage carries one shared file list; the burn tool needs
  // video + subtitle in a known order: [0]=video, [1]=subtitle (the hint
  // says so), validated before the request can fire.
  return (
    <EngineRunnerPage
      tool={tool}
      accept={`${VIDEO_ACCEPT},${SUBTITLE_ACCEPT}`}
      hint="Select the video first, then the .srt/.vtt subtitle file"
      multiple
      endpoint="/media/burn-subtitles"
      buildOptions={() => ({ file: 0, subtitleFile: 1 })}
    />
  );
}

function ResolutionChangePage({ tool }: ToolPageSpec) {
  const [mode, setMode] = useState('resize');
  const [width, setWidth] = useState('0');
  const [height, setHeight] = useState('0');
  const [aspect, setAspect] = useState('');
  const [container, setContainer] = useState('mp4');
  return (
    <EngineRunnerPage
      tool={tool}
      accept={VIDEO_ACCEPT}
      hint="Select a video to resize, crop, or pad"
      optionsPanel={
        <div className="lt-options">
          <Select label="Mode" id="rc-mode" value={mode} onChange={setMode}>
            <option value="resize">Resize — stretch to the exact size</option>
            <option value="crop">Crop — fill the frame, cut the overflow</option>
            <option value="pad">Pad — fit inside, letterbox the rest</option>
          </Select>
          <Field label="Width (px, 0 = auto)" htmlFor="rc-width">
            <Input
              id="rc-width"
              type="number"
              min={0}
              value={width}
              onChange={(e) => {
                setWidth(e.target.value);
              }}
            />
          </Field>
          <Field label="Height (px, 0 = auto)" htmlFor="rc-height">
            <Input
              id="rc-height"
              type="number"
              min={0}
              value={height}
              onChange={(e) => {
                setHeight(e.target.value);
              }}
            />
          </Field>
          <Field label="Aspect ratio (e.g. 9:16, 1:1)" htmlFor="rc-aspect">
            <Input
              id="rc-aspect"
              value={aspect}
              onChange={(e) => {
                setAspect(e.target.value);
              }}
              placeholder="used when width &amp; height are 0"
            />
          </Field>
          <Select label="Output format" id="rc-container" value={container} onChange={setContainer}>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
            <option value="mkv">MKV</option>
            <option value="avi">AVI</option>
          </Select>
        </div>
      }
      endpoint="/media/resolution-change"
      buildOptions={() => {
        const opts: Record<string, unknown> = {
          file: 0,
          mode,
          width: Number(width) || 0,
          height: Number(height) || 0,
          container,
          padColor: '#000000',
        };
        if (aspect !== '') opts['aspect'] = aspect;
        return opts;
      }}
    />
  );
}
