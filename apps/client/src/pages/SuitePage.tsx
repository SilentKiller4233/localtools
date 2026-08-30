import { useMemo, useState } from 'react';
import type { SuiteId } from '@localtools/shared-types';
import { Card, Input, SuiteNav, ToolCard } from '@localtools/ui';
import {
  ALL_TOOLS,
  badgeLabel,
  suiteCaption,
  suiteName,
  type RegisteredTool,
} from '../lib/tool-registry';
import en from '../i18n/en.json';

const UI = en.ui;

export function ToolGrid({ tools }: { tools: readonly RegisteredTool[] }) {
  return (
    <div className="lt-grid">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          title={tool.name}
          description={tool.description}
          badge={{ label: badgeLabel(tool.group), tone: tool.group === 'a' ? 'instant' : 'setup' }}
          icon={<tool.icon size={18} aria-hidden="true" />}
          href={`#/tool/${tool.id}`}
        />
      ))}
    </div>
  );
}

/** One suite's searchable/filterable tool grid (Section 9 home pattern). */
export function SuitePage({
  suite,
  onNavigate,
}: {
  suite: SuiteId;
  onNavigate?: (suite: SuiteId) => void;
}) {
  const [query, setQuery] = useState('');

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ALL_TOOLS.filter((t) => t.suite === suite);
    if (q === '') return list;
    return list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [suite, query]);

  const total = ALL_TOOLS.filter((t) => t.suite === suite).length;

  return (
    <div className="lt-page">
      <SuiteNav
        active={suite}
        {...(onNavigate !== undefined ? { onNavigate } : {})}
        trailing={
          <Input
            type="search"
            placeholder={UI.searchLabel}
            aria-label={UI.searchLabel}
            className="lt-nav-search"
          />
        }
      />
      <main className="lt-main">
        <header className="lt-suite-header">
          <div>
            <h1>{suiteName(suite)}</h1>
            <p className="lt-suite-caption">{suiteCaption(suite)}</p>
          </div>
          <span className="lt-suite-count lt-mono">
            {total} · {UI.toolCountSuffix}
          </span>
        </header>

        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder={UI.filterPlaceholder}
          aria-label={UI.filterPlaceholder}
          className="lt-filter"
        />

        {tools.length > 0 ? (
          <ToolGrid tools={tools} />
        ) : (
          <Card className="lt-empty">
            <p>No tools match “{query}”.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
