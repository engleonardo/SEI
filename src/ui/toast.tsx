import { createRoot, type Root } from 'react-dom/client';
import { Icon } from './icons';
import { getToastContainer } from './shadow';
import { Store, useStore } from './store';
import { classNames } from './utils';

export type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const toastStore = new Store<ToastItem[]>([]);
let root: Root | null = null;
let sequence = 0;

function ensureRoot(): void {
  if (root) return;
  root = createRoot(getToastContainer());
  root.render(<ToastHost />);
}

export function showToast(message: string, kind: ToastKind = 'info', timeoutMs = 5_000): number {
  ensureRoot();
  const id = (sequence += 1);
  toastStore.set((previous) => [...previous, { id, kind, message }]);
  if (timeoutMs > 0) {
    window.setTimeout(() => dismissToast(id), timeoutMs);
  }
  return id;
}

export function dismissToast(id: number): void {
  toastStore.set((previous) => previous.filter((toast) => toast.id !== id));
}

function ToastHost() {
  const toasts = useStore(toastStore);
  return (
    <div className="sf-toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={classNames('sf-toast', `sf-toast--${toast.kind}`)} role="status">
          <Icon
            name={toast.kind === 'error' ? 'alert' : toast.kind === 'success' ? 'check' : 'info'}
            size={16}
          />
          <span className="sf-toast__text">{toast.message}</span>
          <button
            type="button"
            className="sf-icon-btn"
            style={{ width: 22, height: 22 }}
            aria-label="Fechar aviso"
            onClick={() => dismissToast(toast.id)}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
