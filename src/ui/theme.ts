import type { ThemePreference } from '../core/domain/types';

let preference: ThemePreference = 'auto';
const hosts = new Set<HTMLElement>();
let mediaQuery: MediaQueryList | null = null;

function media(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (!mediaQuery) mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery;
}

export function effectiveTheme(): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  return media()?.matches ? 'dark' : 'light';
}

function applyToHost(host: HTMLElement): void {
  host.dataset.sfTheme = effectiveTheme();
}

function applyToDocument(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.sfTheme = effectiveTheme();
}

export function registerThemeHost(host: HTMLElement): void {
  hosts.add(host);
  applyToHost(host);
  applyToDocument();
}

export function unregisterThemeHost(host: HTMLElement): void {
  hosts.delete(host);
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  hosts.forEach(applyToHost);
  applyToDocument();
}

export function getThemePreference(): ThemePreference {
  return preference;
}

const query = media();
if (query) {
  const onChange = () => {
    if (preference === 'auto') {
      hosts.forEach(applyToHost);
      applyToDocument();
    }
  };
  if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
  else query.addListener(onChange);
}
