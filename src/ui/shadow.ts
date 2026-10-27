import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
import css from './styles.css?inline';
import { registerThemeHost } from './theme';

let sharedSheet: CSSStyleSheet | null = null;

function getSheet(): CSSStyleSheet | null {
  if (typeof CSSStyleSheet === 'undefined') return null;
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(css);
  }
  return sharedSheet;
}

export interface ShadowHostOptions {
  className?: string;
  fixed?: boolean;
  zIndex?: number;
}

export interface ShadowHost {
  host: HTMLDivElement;
  container: HTMLDivElement;
  shadow: ShadowRoot;
}

export function createShadowHost(options: ShadowHostOptions = {}): ShadowHost {
  const host = document.createElement('div');
  host.setAttribute('data-sei-flow', '');
  if (options.className) host.className = options.className;
  if (options.fixed) {
    host.style.position = 'fixed';
    host.style.zIndex = String(options.zIndex ?? 2147483000);
  }

  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = getSheet();
  if (sheet) {
    try {
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement('style');
      style.textContent = css;
      shadow.appendChild(style);
    }
  } else {
    const style = document.createElement('style');
    style.textContent = css;
    shadow.appendChild(style);
  }

  const container = document.createElement('div');
  container.className = 'sf-root';
  shadow.appendChild(container);
  registerThemeHost(host);

  return { host, container, shadow };
}

export function mountReact(container: HTMLElement, element: ReactNode): Root {
  const root = createRoot(container);
  root.render(element);
  return root;
}

let dialogHost: ShadowHost | null = null;
let toastHost: ShadowHost | null = null;

export function getDialogContainer(): HTMLElement {
  if (dialogHost && document.documentElement.contains(dialogHost.host)) return dialogHost.container;
  dialogHost = createShadowHost({ fixed: true, zIndex: 2147483000 });
  Object.assign(dialogHost.host.style, {
    inset: '0',
    display: 'block',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(dialogHost.host);
  return dialogHost.container;
}

export function getToastContainer(): HTMLElement {
  if (toastHost && document.documentElement.contains(toastHost.host)) return toastHost.container;
  toastHost = createShadowHost({ fixed: true, zIndex: 2147483001 });
  Object.assign(toastHost.host.style, {
    right: '16px',
    bottom: '16px',
    width: 'min(380px, calc(100vw - 32px))',
    display: 'block',
    pointerEvents: 'none',
  });
  document.documentElement.appendChild(toastHost.host);
  return toastHost.container;
}
