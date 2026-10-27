import type { ReactNode } from 'react';
import { Icon } from '../icons';

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="sf-spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function EmptyState({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sf-empty">
      <Icon name="columns" size={18} />
      <span className="sf-empty__text">{children}</span>
      {actions}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  extra,
}: {
  message: string;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="sf-error" role="alert">
      <Icon name="alert" size={16} />
      <span style={{ flex: 1, minWidth: 160 }}>{message}</span>
      {extra}
      {onRetry && (
        <button type="button" className="sf-btn sf-btn--sm" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}
