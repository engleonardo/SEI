import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icons';
import { getDialogContainer } from '../shadow';
import { classNames } from '../utils';

export interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  closeOnBackdrop?: boolean;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps) {
  const [container] = useState(() => getDialogContainer());
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusable = modal?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([type="hidden"]), textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previousFocus.current?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="sf-modal-overlay"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className={classNames('sf-modal', size === 'sm' && 'sf-modal--sm')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sf-modal__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} className="sf-modal__title">
              {title}
            </h2>
            {subtitle && <p className="sf-modal__subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="sf-icon-btn" aria-label="Fechar" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="sf-modal__body">{children}</div>
        {footer && <div className="sf-modal__footer">{footer}</div>}
      </div>
    </div>,
    container,
  );
}

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={classNames('sf-btn', tone === 'danger' ? 'sf-btn--danger' : 'sf-btn--primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="sf-spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--sf-text-soft)', fontSize: 13.5 }}>{message}</p>
    </Modal>
  );
}
