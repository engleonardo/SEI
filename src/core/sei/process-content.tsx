import { createRoot, type Root } from 'react-dom/client';
import { findProcessNumber } from './process-number';
import { findProcessContentAnchor } from './rows';
import { createShadowHost } from '../../ui/shadow';
import { ProcessPanel } from '../../ui/components/ProcessPanel';

let currentProcess: string | null = null;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

function removePanel(): void {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
  currentProcess = null;
}

function mountPanel(processNumber: string): void {
  if (currentProcess === processNumber && host?.isConnected && root) return;
  removePanel();

  const anchor = findProcessContentAnchor(document);
  const created = createShadowHost();
  created.host.setAttribute('data-sei-flow-process-host', '');
  created.host.style.display = 'block';
  created.host.style.margin = '8px 0 14px';

  if (!anchor || anchor === document.body || anchor.id === 'container') {
    (anchor ?? document.body).prepend(created.host);
  } else {
    anchor.insertAdjacentElement('afterend', created.host);
  }

  currentProcess = processNumber;
  host = created.host;
  root = createRoot(created.container);
  root.render(<ProcessPanel processNumber={processNumber} />);
}

function ensurePanel(): void {
  const processNumber = findProcessNumber(document);
  if (!processNumber) return;
  mountPanel(processNumber);
}

export function startProcessContent(): () => void {
  let destroyed = false;
  let timer: number | null = null;
  let lastHref = location.href;

  const schedule = () => {
    if (destroyed) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      ensurePanel();
    }, 250);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });

  const urlTimer = window.setInterval(() => {
    if (destroyed) return;
    if (location.href !== lastHref) {
      lastHref = location.href;
      schedule();
    }
  }, 1_000);

  ensurePanel();

  return () => {
    destroyed = true;
    observer.disconnect();
    window.clearInterval(urlTimer);
    if (timer) window.clearTimeout(timer);
    removePanel();
  };
}
