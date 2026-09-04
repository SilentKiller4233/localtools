/**
 * Per-tool page specs for the 30 Text & Dev Group A tools (Section 9).
 * Every page = DevTextRunner frame + tool options + a result view.
 * State lives in each per-tool component; the dispatcher maps id → page.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Field, Input } from '@localtools/ui';
import { DevTextRunner, download } from './DevTextRunner';
import type { RegisteredTool } from '../lib/tool-registry';

interface ToolProps {
  tool: RegisteredTool;
}

/* ---------------- shared bits ---------------- */

function Sel({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className="lt-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CopyBox({ value, label = 'Output' }: { value: string; label?: string }) {
  return (
    <textarea
      className="lt-diff-pre lt-mono"
      rows={8}
      readOnly
      value={value}
      aria-label={label}
      onFocus={(e) => {
        e.target.select();
      }}
    />
  );
}

function TextOut({ result }: { result: unknown }) {
  const r = result as { output?: string } | string | null;
  const text = typeof r === 'string' ? r : (r?.output ?? '');
  return <CopyBox value={text} />;
}

/* ---------------- dispatcher ---------------- */

export function devTextToolPage(tool: RegisteredTool): ReactNode {
  switch (tool.id) {
    case 'json-formatter':
      return <JsonPage key={tool.id} tool={tool} />;
    case 'yaml-json':
      return <YamlJsonPage key={tool.id} tool={tool} />;
    case 'csv-json':
      return <CsvJsonPage key={tool.id} tool={tool} />;
    case 'xml-formatter':
      return <XmlPage key={tool.id} tool={tool} />;
    case 'base64':
      return <Base64Page key={tool.id} tool={tool} />;
    case 'url-encoder':
      return <UrlPage key={tool.id} tool={tool} />;
    case 'jwt-decoder':
      return <JwtPage key={tool.id} tool={tool} />;
    case 'hash-generator':
      return <HashPage key={tool.id} tool={tool} />;
    case 'file-hash-checker':
      return <FileHashPage key={tool.id} tool={tool} />;
    case 'uuid-generator':
      return <IdPage key={tool.id} tool={tool} />;
    case 'case-converter':
      return <CasePage key={tool.id} tool={tool} />;
    case 'slug-generator':
      return <SlugPage key={tool.id} tool={tool} />;
    case 'lorem-ipsum':
      return <LoremPage key={tool.id} tool={tool} />;
    case 'password-generator':
      return <PasswordPage key={tool.id} tool={tool} />;
    case 'fake-data-generator':
      return <FakeDataPage key={tool.id} tool={tool} />;
    case 'unit-converter':
      return <UnitPage key={tool.id} tool={tool} />;
    case 'regex-tester':
      return <RegexPage key={tool.id} tool={tool} />;
    case 'text-diff':
      return <DiffPage key={tool.id} tool={tool} />;
    case 'minifier-beautifier':
      return <MinifyPage key={tool.id} tool={tool} />;
    case 'markdown-converter':
      return <MarkdownPage key={tool.id} tool={tool} />;
    case 'markdown-to-pdf':
      return <MdPdfPage key={tool.id} tool={tool} />;
    case 'color-converter':
      return <ColorPage key={tool.id} tool={tool} />;
    case 'gradient-generator':
      return <GradientPage key={tool.id} tool={tool} />;
    case 'cron-parser':
      return <CronPage key={tool.id} tool={tool} />;
    case 'timestamp-converter':
      return <TimestampPage key={tool.id} tool={tool} />;
    case 'qr-code':
      return <QrPage key={tool.id} tool={tool} />;
    case 'barcode-generator':
      return <BarcodePage key={tool.id} tool={tool} />;
    case 'zip-unzip':
      return <ZipPage key={tool.id} tool={tool} />;
    case 'sitemap-generator':
      return <SitemapPage key={tool.id} tool={tool} />;
    case 'og-preview':
      return <OgPage key={tool.id} tool={tool} />;
    default:
      return null;
  }
}

/* ---------------- formatters ---------------- */

function JsonPage({ tool }: ToolProps) {
  const [mode, setMode] = useState('format');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="JSON"
      placeholder={'{"key": "value"}'}
      optionsPanel={
        <Sel
          id="json-mode"
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            ['format', 'Format (pretty)'],
            ['minify', 'Minify'],
            ['validate', 'Validate only'],
          ]}
        />
      }
      buildOptions={(inp) => ({ text: inp.text, mode })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function YamlJsonPage({ tool }: ToolProps) {
  const [direction, setDirection] = useState('yaml-to-json');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Input"
      placeholder={direction === 'yaml-to-json' ? 'name: localtools' : '{"name": "localtools"}'}
      optionsPanel={
        <Sel
          id="yaml-dir"
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            ['yaml-to-json', 'YAML → JSON'],
            ['json-to-yaml', 'JSON → YAML'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, direction })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function CsvJsonPage({ tool }: ToolProps) {
  const [direction, setDirection] = useState('csv-to-json');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Input"
      placeholder={
        direction === 'csv-to-json' ? 'name,suite\nlocaltools,4' : '[{"name": "localtools"}]'
      }
      optionsPanel={
        <Sel
          id="csv-dir"
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            ['csv-to-json', 'CSV → JSON'],
            ['json-to-csv', 'JSON → CSV'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, direction })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function XmlPage({ tool }: ToolProps) {
  const [minify, setMinify] = useState('pretty');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="XML"
      placeholder={'<root><item>hello</item></root>'}
      optionsPanel={
        <Sel
          id="xml-mode"
          label="Mode"
          value={minify}
          onChange={setMinify}
          options={[
            ['pretty', 'Pretty-print'],
            ['minify', 'Minify'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, minify: minify === 'minify' })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

/* ---------------- encoders ---------------- */

function Base64Page({ tool }: ToolProps) {
  const [direction, setDirection] = useState('encode');
  const [fileMode, setFileMode] = useState('text');
  return (
    <DevTextRunner
      tool={tool}
      input={fileMode === 'text' ? 'text' : 'files'}
      inputLabel={fileMode === 'text' ? 'Text' : 'Drop a file'}
      placeholder="hello world"
      optionsPanel={
        <>
          <Sel
            id="b64-dir"
            label="Direction"
            value={direction}
            onChange={setDirection}
            options={[
              ['encode', 'Encode'],
              ['decode', 'Decode'],
            ]}
          />
          <Sel
            id="b64-filemode"
            label="Input"
            value={fileMode}
            onChange={setFileMode}
            options={[
              ['text', 'Text'],
              ['file', 'File'],
            ]}
          />
        </>
      }
      buildOptions={(i) => ({ text: i.text, direction, fileMode: fileMode === 'file' })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function UrlPage({ tool }: ToolProps) {
  const [mode, setMode] = useState('encode');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Text or URL"
      placeholder="https://example.com/hello world?x=1"
      optionsPanel={
        <Sel
          id="url-mode"
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            ['encode', 'Encode URL'],
            ['encode-component', 'Encode component'],
            ['decode', 'Decode'],
          ]}
        />
      }
      buildOptions={(inp) => ({ text: inp.text, mode })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function JwtPage({ tool }: ToolProps) {
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="JWT token"
      placeholder="eyJhbGciOiJIUzI1NiJ9…"
      buildOptions={(i) => ({ text: i.text })}
      renderResult={(r) => {
        const res = r as {
          header?: Record<string, unknown>;
          payload?: Record<string, unknown>;
          note?: string;
        } | null;
        if (res === null) return null;
        return (
          <div>
            <p className="lt-suite-caption" role="alert">
              ⚠ {res.note}
            </p>
            <h3 className="lt-suite-caption">Header</h3>
            <CopyBox value={JSON.stringify(res.header, null, 2)} label="Header" />
            <h3 className="lt-suite-caption">Payload</h3>
            <CopyBox value={JSON.stringify(res.payload, null, 2)} label="Payload" />
          </div>
        );
      }}
    />
  );
}

/* ---------------- hashing ---------------- */

const ALL_ALGS: [string, string][] = [
  ['md5', 'MD5'],
  ['sha-1', 'SHA-1'],
  ['sha-256', 'SHA-256'],
  ['sha-512', 'SHA-512'],
];

function HashPage({ tool }: ToolProps) {
  const [alg, setAlg] = useState('sha-256');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Text to hash"
      placeholder="hello"
      optionsPanel={
        <Sel id="hash-alg" label="Algorithm" value={alg} onChange={setAlg} options={ALL_ALGS} />
      }
      buildOptions={(i) => ({ text: i.text, algorithms: [alg] })}
      renderResult={(r) => <HashView result={r} />}
    />
  );
}

function FileHashPage({ tool }: ToolProps) {
  const [alg, setAlg] = useState('sha-256');
  return (
    <DevTextRunner
      tool={tool}
      input="files"
      inputLabel="Drop a file to check its hashes"
      optionsPanel={
        <Sel id="fhash-alg" label="Algorithm" value={alg} onChange={setAlg} options={ALL_ALGS} />
      }
      buildOptions={() => ({ algorithms: [alg] })}
      renderResult={(r) => <HashView result={r} />}
    />
  );
}

function HashView({ result }: { result: unknown }) {
  const rows = result as { algorithm: string; hex: string }[] | null;
  if (rows === null || !Array.isArray(rows)) return null;
  return (
    <table className="lt-diff-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.algorithm}>
            <td className="lt-mono">{r.algorithm}</td>
            <td className="lt-mono">{r.hex}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- generators ---------------- */

function IdPage({ tool }: ToolProps) {
  const [kind, setKind] = useState('uuid');
  const [count, setCount] = useState('5');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Sel
            id="id-kind"
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              ['uuid', 'UUID v4'],
              ['ulid', 'ULID'],
            ]}
          />
          <Field label="How many" htmlFor="id-count">
            <Input
              id="id-count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({ kind, count: Number(count) || 1 })}
      renderResult={(r) => {
        const res = r as { values?: string[] } | null;
        return res?.values === undefined ? null : <CopyBox value={res.values.join('\n')} />;
      }}
    />
  );
}

function CasePage({ tool }: ToolProps) {
  const [kind, setKind] = useState('camel');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Text"
      placeholder="hello world test"
      optionsPanel={
        <Sel
          id="case-kind"
          label="Convert to"
          value={kind}
          onChange={setKind}
          options={[
            ['camel', 'camelCase'],
            ['pascal', 'PascalCase'],
            ['snake', 'snake_case'],
            ['kebab', 'kebab-case'],
            ['constant', 'CONSTANT_CASE'],
            ['title', 'Title Case'],
            ['sentence', 'Sentence case'],
            ['lower', 'lower case'],
            ['upper', 'UPPER CASE'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, kind })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function SlugPage({ tool }: ToolProps) {
  const [maxLength, setMaxLength] = useState('80');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Title"
      placeholder="10 Awesome Tips & Tricks!"
      optionsPanel={
        <Field label="Max length" htmlFor="slug-max">
          <Input
            id="slug-max"
            type="number"
            value={maxLength}
            onChange={(e) => {
              setMaxLength(e.target.value);
            }}
          />
        </Field>
      }
      buildOptions={(i) => ({ text: i.text, maxLength: Number(maxLength) || 80 })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function LoremPage({ tool }: ToolProps) {
  const [unit, setUnit] = useState('paragraphs');
  const [count, setCount] = useState('3');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Sel
            id="lorem-unit"
            label="Unit"
            value={unit}
            onChange={setUnit}
            options={[
              ['paragraphs', 'Paragraphs'],
              ['sentences', 'Sentences'],
              ['words', 'Words'],
            ]}
          />
          <Field label="Count" htmlFor="lorem-count">
            <Input
              id="lorem-count"
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({ unit, count: Number(count) || 3 })}
      renderResult={(r) => <TextOut result={r} />}
    />
  );
}

function PasswordPage({ tool }: ToolProps) {
  const [kind, setKind] = useState('password');
  const [length, setLength] = useState('16');
  const [words, setWords] = useState('4');
  const [symbols, setSymbols] = useState('no');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Sel
            id="pw-kind"
            label="Type"
            value={kind}
            onChange={setKind}
            options={[
              ['password', 'Random password'],
              ['passphrase', 'Passphrase'],
            ]}
          />
          {kind === 'password' ? (
            <>
              <Field label="Length" htmlFor="pw-len">
                <Input
                  id="pw-len"
                  type="number"
                  min={4}
                  max={128}
                  value={length}
                  onChange={(e) => {
                    setLength(e.target.value);
                  }}
                />
              </Field>
              <Sel
                id="pw-sym"
                label="Symbols"
                value={symbols}
                onChange={setSymbols}
                options={[
                  ['no', 'No symbols'],
                  ['yes', 'Include symbols'],
                ]}
              />
            </>
          ) : (
            <Field label="Words" htmlFor="pw-words">
              <Input
                id="pw-words"
                type="number"
                min={3}
                max={12}
                value={words}
                onChange={(e) => {
                  setWords(e.target.value);
                }}
              />
            </Field>
          )}
        </>
      }
      buildOptions={() => ({
        kind,
        length: Number(length) || 16,
        words: Number(words) || 4,
        useSymbols: symbols === 'yes',
      })}
      renderResult={(r) => {
        const res = r as { value?: string; entropyBits?: number; strength?: string } | null;
        if (res?.value === undefined) return null;
        return (
          <div>
            <CopyBox value={res.value} />
            <p className="lt-suite-caption">
              ≈ {String(res.entropyBits)} bits of entropy — {res.strength}
            </p>
          </div>
        );
      }}
    />
  );
}

function FakeDataPage({ tool }: ToolProps) {
  const [category, setCategory] = useState('person');
  const [count, setCount] = useState('10');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Sel
            id="fake-cat"
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              ['person', 'People'],
              ['address', 'Addresses'],
              ['contact', 'Contacts'],
              ['company', 'Companies'],
              ['lorem', 'Text'],
              ['mixed', 'Mixed'],
            ]}
          />
          <Field label="Rows" htmlFor="fake-count">
            <Input
              id="fake-count"
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(e) => {
                setCount(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({ category, count: Number(count) || 10 })}
      renderResult={(r) => {
        const res = r as { rows?: Record<string, string>[]; note?: string } | null;
        if (res?.rows === undefined) return null;
        const headers = Object.keys(res.rows[0] ?? {});
        return (
          <div>
            <p className="lt-suite-caption">{res.note}</p>
            <table className="lt-diff-table">
              <thead>
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="lt-mono">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.slice(0, 50).map((row, i) => (
                  <tr key={String(i)}>
                    {headers.map((h) => (
                      <td key={h} className="lt-mono">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}

function UnitPage({ tool }: ToolProps) {
  const [category, setCategory] = useState('length');
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState('km');
  const [to, setTo] = useState('mi');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Sel
            id="unit-cat"
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              ['length', 'Length'],
              ['weight', 'Weight'],
              ['temperature', 'Temperature'],
              ['data', 'Data size'],
              ['speed', 'Speed'],
              ['area', 'Area'],
              ['volume', 'Volume'],
              ['time', 'Time'],
            ]}
          />
          <Field label="Value" htmlFor="unit-val">
            <Input
              id="unit-val"
              type="number"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
            />
          </Field>
          <Field label="From" htmlFor="unit-from">
            <Input
              id="unit-from"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </Field>
          <Field label="To" htmlFor="unit-to">
            <Input
              id="unit-to"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </Field>
        </>
      }
      buildOptions={() => ({ value: Number(value), category, from, to })}
      renderResult={(r) => {
        const res = r as { value?: number } | null;
        return res?.value === undefined ? null : <CopyBox value={String(res.value)} />;
      }}
    />
  );
}

/* ---------------- dev tools ---------------- */

function RegexPage({ tool }: ToolProps) {
  const [flags, setFlags] = useState('g');
  const [regexPattern, setRegexPattern] = useState('');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Test text"
      placeholder="The quick brown fox…"
      optionsPanel={
        <>
          <Field label="Pattern (without slashes)" htmlFor="re-pattern-page">
            <Input
              id="re-pattern-page"
              value={regexPattern}
              onChange={(e) => {
                setRegexPattern(e.target.value);
              }}
            />
          </Field>
          <Field label="Flags" htmlFor="re-flags">
            <Input
              id="re-flags"
              value={flags}
              onChange={(e) => {
                setFlags(e.target.value);
              }}
            />
          </Field>
        </>
      }
      validate={() => (regexPattern === '' ? 'Enter a pattern above' : undefined)}
      buildOptions={(inp) => ({ pattern: regexPattern, text: inp.text, flags })}
      renderResult={(r) => {
        const res = r as {
          matches?: { text: string; index: number }[];
          count?: number;
          namedGroups?: string[];
        } | null;
        if (res === null) return null;
        return (
          <div>
            <p className="lt-suite-caption">
              {String(res.count ?? 0)} matches
              {res.namedGroups?.length ? ` · groups: ${res.namedGroups.join(', ')}` : ''}
            </p>
            {(res.matches ?? []).slice(0, 100).map((m, i) => (
              <p key={String(i)} className="lt-mono">
                [{String(m.index)}] {m.text}
              </p>
            ))}
          </div>
        );
      }}
    />
  );
}

function DiffPage({ tool }: ToolProps) {
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Original text"
      extraInputs={[{ key: 'b', label: 'Changed text' }]}
      buildOptions={(i) => ({ a: i.text, b: i.extras['b'] ?? '' })}
      renderResult={(r) => {
        const res = r as {
          patch?: string;
          added?: number;
          removed?: number;
          identical?: boolean;
        } | null;
        if (res === null) return null;
        return (
          <div>
            <p className="lt-suite-caption">
              {res.identical === true
                ? 'Texts are identical.'
                : `+${String(res.added ?? 0)} / −${String(res.removed ?? 0)} lines changed`}
            </p>
            <pre className="lt-diff-pre lt-mono">{res.patch}</pre>
          </div>
        );
      }}
    />
  );
}

function MinifyPage({ tool }: ToolProps) {
  const [language, setLanguage] = useState('css');
  const [mode, setMode] = useState('minify');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Code"
      placeholder=".a { color: red; }"
      optionsPanel={
        <>
          <Sel
            id="min-lang"
            label="Language"
            value={language}
            onChange={setLanguage}
            options={[
              ['css', 'CSS'],
              ['js', 'JavaScript'],
              ['html', 'HTML'],
            ]}
          />
          <Sel
            id="min-mode"
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              ['minify', 'Minify'],
              ['beautify', 'Beautify'],
            ]}
          />
        </>
      }
      buildOptions={(i) => ({ text: i.text, language, mode })}
      renderResult={(r) => {
        const res = r as { output?: string; originalSize?: number; newSize?: number } | null;
        if (res?.output === undefined) return null;
        return (
          <div>
            <p className="lt-suite-caption">
              {String(res.originalSize)} → {String(res.newSize)} chars
            </p>
            <CopyBox value={res.output} />
          </div>
        );
      }}
    />
  );
}

function MarkdownPage({ tool }: ToolProps) {
  const [direction, setDirection] = useState('md-to-html');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel={direction === 'md-to-html' ? 'Markdown' : 'HTML'}
      placeholder="# Title"
      optionsPanel={
        <Sel
          id="md-dir"
          label="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            ['md-to-html', 'Markdown → HTML'],
            ['html-to-md', 'HTML → Markdown'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, direction })}
      renderResult={(r) => {
        const res = r as { html?: string; markdown?: string } | null;
        const text = res?.html ?? res?.markdown ?? '';
        return <CopyBox value={text} />;
      }}
    />
  );
}

function MdPdfPage({ tool }: ToolProps) {
  const [pageSize, setPageSize] = useState('a4');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Markdown"
      placeholder={'# Title\n\nParagraph…'}
      optionsPanel={
        <Sel
          id="mdpdf-size"
          label="Page size"
          value={pageSize}
          onChange={setPageSize}
          options={[
            ['a4', 'A4'],
            ['letter', 'Letter'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, pageSize })}
      renderResult={(r) => {
        if (!(r instanceof Uint8Array)) return null;
        return (
          <Button
            variant="outline"
            onClick={() => {
              download('localtools-export.pdf', r);
            }}
          >
            Download PDF ({String(Math.max(1, Math.round(r.byteLength / 1024)))} KB)
          </Button>
        );
      }}
    />
  );
}

/* ---------------- colors ---------------- */

function ColorPage({ tool }: ToolProps) {
  const [harmony, setHarmony] = useState('analogous');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Color (hex, rgb(), hsl(), or oklch())"
      placeholder="#3366cc"
      optionsPanel={
        <Sel
          id="color-harmony"
          label="Palette harmony"
          value={harmony}
          onChange={setHarmony}
          options={[
            ['analogous', 'Analogous'],
            ['complementary', 'Complementary'],
            ['triad', 'Triad'],
            ['monochrome', 'Monochrome'],
          ]}
        />
      }
      buildOptions={(i) => ({ text: i.text, harmony })}
      renderResult={(r) => {
        const res = r as {
          converted?: {
            hex: string;
            rgb: { r: number; g: number; b: number };
            hsl: { h: number; s: number; l: number };
            oklch: { l: number; c: number; h: number };
          };
          palette?: { role: string; hex: string }[];
        } | null;
        if (res?.converted === undefined) return null;
        const c = res.converted;
        return (
          <div>
            <table className="lt-diff-table">
              <tbody>
                <tr>
                  <td className="lt-mono">hex</td>
                  <td className="lt-mono">{c.hex}</td>
                </tr>
                <tr>
                  <td className="lt-mono">rgb</td>
                  <td className="lt-mono">
                    rgb({String(c.rgb.r)}, {String(c.rgb.g)}, {String(c.rgb.b)})
                  </td>
                </tr>
                <tr>
                  <td className="lt-mono">hsl</td>
                  <td className="lt-mono">
                    hsl({String(Math.round(c.hsl.h))}, {String(Math.round(c.hsl.s))}%,{' '}
                    {String(Math.round(c.hsl.l))}%)
                  </td>
                </tr>
                <tr>
                  <td className="lt-mono">oklch</td>
                  <td className="lt-mono">
                    oklch({c.oklch.l.toFixed(3)} {c.oklch.c.toFixed(3)}{' '}
                    {String(Math.round(c.oklch.h))})
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="lt-palette-row">
              {(res.palette ?? []).map((s) => (
                <div key={s.role + s.hex} className="lt-palette-swatch" title={s.role}>
                  <div
                    className="lt-palette-color"
                    style={{ background: s.hex }}
                    aria-hidden="true"
                  />
                  <span className="lt-mono">{s.hex}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}

function GradientPage({ tool }: ToolProps) {
  const [from, setFrom] = useState('#3366cc');
  const [to, setTo] = useState('#66ccff');
  const [angle, setAngle] = useState('90');
  const [type, setType] = useState('linear');
  return (
    <DevTextRunner
      tool={tool}
      input="custom"
      optionsPanel={
        <>
          <Field label="From" htmlFor="grad-from">
            <Input
              id="grad-from"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
              }}
            />
          </Field>
          <Field label="To" htmlFor="grad-to">
            <Input
              id="grad-to"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
              }}
            />
          </Field>
          <Field label="Angle (deg)" htmlFor="grad-angle">
            <Input
              id="grad-angle"
              type="number"
              value={angle}
              onChange={(e) => {
                setAngle(e.target.value);
              }}
            />
          </Field>
          <Sel
            id="grad-type"
            label="Type"
            value={type}
            onChange={setType}
            options={[
              ['linear', 'Linear'],
              ['radial', 'Radial'],
            ]}
          />
        </>
      }
      buildOptions={() => ({
        stops: [
          { color: from, position: 0 },
          { color: to, position: 100 },
        ],
        angle: Number(angle) || 0,
        type,
      })}
      renderResult={(r) => {
        const res = r as { css?: string } | null;
        if (res?.css === undefined) return null;
        return (
          <div>
            <div
              ref={(el) => {
                if (el !== null && res.css !== undefined)
                  el.style.cssText = `height:80px;border-radius:8px;${res.css}`;
              }}
              aria-hidden="true"
            />
            <CopyBox value={res.css} />
          </div>
        );
      }}
    />
  );
}

/* ---------------- time ---------------- */

function CronPage({ tool }: ToolProps) {
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Cron expression"
      placeholder="*/5 * * * *"
      buildOptions={(i) => ({ text: i.text })}
      renderResult={(r) => {
        const res = r as { text?: string; fields?: { label: string; value: string }[] } | null;
        if (res === null) return null;
        return (
          <div>
            <p className="lt-suite-caption" style={{ fontSize: '1.05rem' }}>
              {res.text}
            </p>
            <table className="lt-diff-table">
              <tbody>
                {(res.fields ?? []).map((f) => (
                  <tr key={f.label}>
                    <td className="lt-mono">{f.label}</td>
                    <td className="lt-mono">{f.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    />
  );
}

function TimestampPage({ tool }: ToolProps) {
  const [timezone, setTimezone] = useState('UTC');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Timestamp or date"
      placeholder="1758000000"
      optionsPanel={
        <Field label="Timezone (IANA)" htmlFor="ts-tz">
          <Input
            id="ts-tz"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
            }}
          />
        </Field>
      }
      buildOptions={(i) => ({ text: i.text, timezone })}
      renderResult={(r) => {
        const res = r as { iso?: string; unix?: number; utc?: string; relative?: string } | null;
        if (res === null) return null;
        return (
          <table className="lt-diff-table">
            <tbody>
              <tr>
                <td className="lt-mono">local</td>
                <td className="lt-mono">{res.iso}</td>
              </tr>
              <tr>
                <td className="lt-mono">unix</td>
                <td className="lt-mono">{String(res.unix)}</td>
              </tr>
              <tr>
                <td className="lt-mono">utc</td>
                <td className="lt-mono">{res.utc}</td>
              </tr>
              <tr>
                <td className="lt-mono">relative</td>
                <td className="lt-mono">{res.relative}</td>
              </tr>
            </tbody>
          </table>
        );
      }}
    />
  );
}

/* ---------------- QR / barcode ---------------- */

function QrPage({ tool }: ToolProps) {
  const [mode, setMode] = useState('generate');
  const [size, setSize] = useState('256');
  const [ecc, setEcc] = useState('M');
  return (
    <DevTextRunner
      tool={tool}
      input={mode === 'generate' ? 'text' : 'files'}
      inputLabel={
        mode === 'generate' ? 'QR content (URL, text…)' : 'Drop an image containing a QR code'
      }
      placeholder="https://example.com"
      {...(mode === 'scan' ? { accept: 'image/*' } : {})}
      optionsPanel={
        <>
          <Sel
            id="qr-mode"
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              ['generate', 'Generate'],
              ['scan', 'Scan an image'],
            ]}
          />
          {mode === 'generate' ? (
            <>
              <Field label="Size (px)" htmlFor="qr-size">
                <Input
                  id="qr-size"
                  type="number"
                  value={size}
                  onChange={(e) => {
                    setSize(e.target.value);
                  }}
                />
              </Field>
              <Sel
                id="qr-ecc"
                label="Error correction"
                value={ecc}
                onChange={setEcc}
                options={[
                  ['L', 'L — 7%'],
                  ['M', 'M — 15%'],
                  ['Q', 'Q — 25%'],
                  ['H', 'H — 30%'],
                ]}
              />
            </>
          ) : null}
        </>
      }
      buildOptions={(i) =>
        mode === 'generate' ? { text: i.text, size: Number(size) || 256, ecc } : {}
      }
      workerTool={mode === 'generate' ? 'qr-code' : 'qr-scan'}
      renderResult={(r) => {
        if (mode === 'scan') {
          const res = r as { text?: string } | null;
          return res?.text === undefined ? null : <CopyBox value={res.text} />;
        }
        const res = r as { svg?: string; png?: Uint8Array } | null;
        if (res?.png === undefined) return null;
        return (
          <div>
            <div
              ref={(el) => {
                if (el !== null) el.innerHTML = res.svg ?? '';
              }}
              aria-label="QR code preview"
            />
            <p className="lt-tool-actions">
              <Button
                variant="outline"
                onClick={() => {
                  download('localtools-qr.png', res.png as Uint8Array);
                }}
              >
                Download PNG
              </Button>{' '}
              <Button
                variant="outline"
                onClick={() => {
                  download('localtools-qr.svg', new TextEncoder().encode(res.svg ?? ''));
                }}
              >
                Download SVG
              </Button>
            </p>
          </div>
        );
      }}
    />
  );
}

function BarcodePage({ tool }: ToolProps) {
  const [format, setFormat] = useState('code128');
  const [showText, setShowText] = useState('yes');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Barcode content"
      placeholder="LOCALTOOLS-42"
      optionsPanel={
        <>
          <Sel
            id="bc-format"
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              ['code128', 'Code 128'],
              ['code39', 'Code 39'],
              ['ean13', 'EAN-13'],
              ['ean8', 'EAN-8'],
              ['upca', 'UPC-A'],
              ['itf14', 'ITF-14'],
              ['codabar', 'Codabar'],
              ['code93', 'Code 93'],
              ['msi', 'MSI'],
            ]}
          />
          <Sel
            id="bc-text"
            label="Human-readable text"
            value={showText}
            onChange={setShowText}
            options={[
              ['yes', 'Show'],
              ['no', 'Hide'],
            ]}
          />
        </>
      }
      buildOptions={(i) => ({ text: i.text, format, showText: showText === 'yes' })}
      renderResult={(r) => {
        const res = r as { svg?: string } | null;
        if (res?.svg === undefined) return null;
        return (
          <div>
            <div
              ref={(el) => {
                if (el !== null) el.innerHTML = res.svg ?? '';
              }}
              aria-label="Barcode preview"
            />
            <CopyBox value={res.svg} label="SVG markup" />
          </div>
        );
      }}
    />
  );
}

/* ---------------- zip ---------------- */

function ZipPage({ tool }: ToolProps) {
  const [mode, setMode] = useState('create');
  return (
    <DevTextRunner
      tool={tool}
      input="files"
      inputLabel={mode === 'create' ? 'Drop files to zip' : 'Drop a .zip to extract'}
      {...(mode === 'extract' ? { accept: '.zip,application/zip' } : {})}
      multiple={mode === 'create'}
      optionsPanel={
        <Sel
          id="zip-mode"
          label="Mode"
          value={mode}
          onChange={setMode}
          options={[
            ['create', 'Create a zip'],
            ['extract', 'Extract a zip'],
          ]}
        />
      }
      buildOptions={() => ({})}
      workerTool={mode === 'create' ? 'zip-create' : 'zip-extract'}
      renderResult={(r) => {
        if (mode === 'create') {
          const res = r as { zip?: Uint8Array; entries?: { name: string; size: number }[] } | null;
          if (res?.zip === undefined) return null;
          const zipBytes = res.zip;
          return (
            <div>
              <p className="lt-tool-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    download('localtools.zip', zipBytes);
                  }}
                >
                  Download localtools.zip (
                  {String(Math.max(1, Math.round(zipBytes.byteLength / 1024)))} KB)
                </Button>
              </p>
              <p className="lt-suite-caption">
                {(res.entries ?? []).map((e) => e.name).join(', ')}
              </p>
            </div>
          );
        }
        const res = r as {
          files?: { name: string; bytes: Uint8Array }[];
          entries?: { name: string; size: number }[];
        } | null;
        if (res?.files === undefined) return null;
        return (
          <ul className="lt-output-list">
            {res.files.map((f) => (
              <li key={f.name}>
                <Button
                  variant="outline"
                  onClick={() => {
                    download(f.name.split('/').pop() ?? f.name, f.bytes);
                  }}
                >
                  {f.name} ({String(Math.max(1, Math.round(f.bytes.byteLength / 1024)))} KB)
                </Button>
              </li>
            ))}
          </ul>
        );
      }}
    />
  );
}

/* ---------------- webdev ---------------- */

function SitemapPage({ tool }: ToolProps) {
  const [freq, setFreq] = useState('weekly');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Page URLs (one per line; optionally 'url frequency priority')"
      placeholder={'https://example.com/\nhttps://example.com/about weekly 0.8'}
      optionsPanel={
        <Sel
          id="sm-freq"
          label="Default frequency"
          value={freq}
          onChange={setFreq}
          options={[
            ['always', 'Always'],
            ['hourly', 'Hourly'],
            ['daily', 'Daily'],
            ['weekly', 'Weekly'],
            ['monthly', 'Monthly'],
            ['yearly', 'Yearly'],
            ['never', 'Never'],
          ]}
        />
      }
      buildOptions={(i) => ({ urls: i.text, changefreq: freq })}
      renderResult={(r) => {
        const res = r as { sitemap?: string; robots?: string } | null;
        if (res === null) return null;
        return (
          <div>
            <h3 className="lt-suite-caption">sitemap.xml</h3>
            <CopyBox value={res.sitemap ?? ''} />
            <h3 className="lt-suite-caption">robots.txt</h3>
            <CopyBox value={res.robots ?? ''} />
          </div>
        );
      }}
    />
  );
}

function OgPage({ tool }: ToolProps) {
  const [pasted, setPasted] = useState('');
  return (
    <DevTextRunner
      tool={tool}
      input="text"
      inputLabel="Paste existing <meta> tags (or leave empty and it renders a sample card)"
      placeholder={'<meta property="og:title" content="My Page" />'}
      optionsPanel={
        <Field label="Or enter a title to preview" htmlFor="og-title">
          <Input
            id="og-title"
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
            }}
          />
        </Field>
      }
      buildOptions={(i) => ({
        pasted: i.text,
        ogTitle: pasted,
        ogDescription: 'A one-sentence description for the preview.',
        ogImage: 'https://example.com/preview.png',
        ogUrl: 'https://example.com',
        ogSiteName: 'Example Site',
      })}
      renderResult={(r) => {
        const res = r as {
          metaTags?: string;
          card?: {
            ogTitle: string;
            ogDescription: string;
            ogImage: string;
            ogUrl: string;
            ogSiteName: string;
          };
        } | null;
        if (res?.card === undefined) return null;
        return (
          <div>
            <h3 className="lt-suite-caption">Preview card</h3>
            <div className="lt-og-card">
              <div
                className="lt-og-image"
                style={{
                  background: `center / cover no-repeat url(${res.card.ogImage})`,
                  height: 120,
                  borderRadius: '8px 8px 0 0',
                }}
              />
              <div style={{ padding: '12px' }}>
                <p className="lt-suite-caption">{res.card.ogSiteName}</p>
                <p style={{ fontWeight: 600, margin: '4px 0' }}>{res.card.ogTitle}</p>
                <p className="lt-suite-caption">{res.card.ogDescription}</p>
                <p className="lt-suite-caption lt-mono">{res.card.ogUrl}</p>
              </div>
            </div>
            <h3 className="lt-suite-caption">Meta tags</h3>
            <CopyBox value={res.metaTags ?? ''} />
          </div>
        );
      }}
    />
  );
}
