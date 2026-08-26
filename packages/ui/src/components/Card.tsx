import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';
import { Badge, type BadgeTone } from './Badge';

/** Flat surface card with hairline border. */
export function Card(props: HTMLAttributes<HTMLDivElement>): ReactNode {
  const { className, ...rest } = props;
  return <div className={cx('lt-card', className)} {...rest} />;
}

export interface ToolCardProps {
  title: string;
  description: string;
  badge: { label: string; tone: BadgeTone };
  icon: ReactNode;
  /** Renders as a link when given, otherwise an activated button. */
  href?: string;
  onOpen?: () => void;
}

/**
 * Home-grid card per Section 9: icon, name, one-line description, badge.
 * Hover lifts toward the accent; the whole card is one hit target.
 */
export function ToolCard({
  title,
  description,
  badge,
  icon,
  href,
  onOpen,
}: ToolCardProps): ReactNode {
  const inner = (
    <>
      <span aria-hidden="true" className="lt-tool-card__icon">
        {icon}
      </span>
      <span className="lt-tool-card__body">
        <span className="lt-tool-card__title">{title}</span>
        <span className="lt-tool-card__desc">{description}</span>
      </span>
      <span className="lt-tool-card__badge">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </span>
    </>
  );
  if (href !== undefined && href !== '') {
    return (
      <a className="lt-tool-card" href={href}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className="lt-tool-card" onClick={onOpen}>
      {inner}
    </button>
  );
}
