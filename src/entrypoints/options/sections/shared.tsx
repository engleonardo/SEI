import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../../../ui/icons';

export type NoticeKind = 'success' | 'error' | 'warning' | 'info';
export type Notice = { kind: NoticeKind; text: string } | null;

export function Spinner() {
  return <span className="sfo-spinner" aria-hidden="true" />;
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="sfo-card">
      <div className="sfo-card__head">
        {icon && (
          <span className="sfo-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Icon name={icon} size={17} />
          </span>
        )}
        <div>
          <h2 className="sfo-card__title">{title}</h2>
          {subtitle && <p className="sfo-card__sub">{subtitle}</p>}
        </div>
      </div>
      <div className="sfo-card__body">{children}</div>
      {footer && <div className="sfo-card__footer">{footer}</div>}
    </section>
  );
}

/** Cartão recolhível para conteúdo usado com pouca frequência. */
export function CollapsibleCard({
  title,
  subtitle,
  icon,
  badge,
  children,
  footer,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="sfo-card sfo-card--collapsible"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="sfo-card__head sfo-card__head--summary">
        {icon && (
          <span className="sfo-logo" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Icon name={icon} size={17} />
          </span>
        )}
        <div>
          <h2 className="sfo-card__title">{title}</h2>
          {subtitle && <p className="sfo-card__sub">{subtitle}</p>}
        </div>
        <span className="sfo-card__summary-end">
          {badge && <span className="sfo-pill sfo-pill--accent">{badge}</span>}
          <span className="sfo-card__chevron" aria-hidden="true">
            <Icon name="chevronDown" size={16} />
          </span>
        </span>
      </summary>
      <div className="sfo-card__body">{children}</div>
      {footer && <div className="sfo-card__footer">{footer}</div>}
    </details>
  );
}

export function StatusPill({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return <span className={`sfo-pill sfo-pill--${tone}`}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="sfo-empty">{children}</div>;
}
