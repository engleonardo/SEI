import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { detectPageKind } from '../core/sei/detect';
import { startProcessContent } from '../core/sei/process-content';
import { getSettings, watchSettings } from '../core/storage/settings';
import { startListManager } from '../ui/list/manager';
import { setThemePreference } from '../ui/theme';

declare global {
  interface Window {
    __seiFlowInjected?: boolean;
    __seiFlowCleanup?: () => void;
    __seiFlowUrlTimer?: number;
  }
}

export default defineUnlistedScript(() => {
  if (window.__seiFlowInjected) return;
  window.__seiFlowInjected = true;

  // Mantém o tema sincronizado quando o usuário alterna no painel ou nas opções.
  try {
    watchSettings((settings) => setThemePreference(settings.theme));
  } catch {
    // segue com o tema carregado no boot
  }

  let cleanup: (() => void) | null = null;
  let mode: 'list' | 'content' | null = null;
  let destroyed = false;

  const start = (kind: 'process-list' | 'process-content') => {
    cleanup?.();
    cleanup = kind === 'process-list' ? startListManager() : startProcessContent();
    mode = kind === 'process-list' ? 'list' : 'content';
  };

  const boot = async () => {
    if (destroyed) return;
    try {
      const settings = await getSettings();
      setThemePreference(settings.theme);
    } catch {
      // segue com o tema automático
    }

    const kind = detectPageKind(document, location.href);
    if (kind === 'process-list') start('process-list');
    else if (kind === 'process-content') start('process-content');
  };

  const restartIfNeeded = () => {
    if (destroyed) return;
    const kind = detectPageKind(document, location.href);
    if (kind === 'unknown') return;
    if (kind === 'process-list' && mode === 'list') return;
    if (kind === 'process-content' && mode === 'content') return;
    start(kind);
  };

  void boot();

  const retryTimer = window.setInterval(() => {
    if (destroyed) return;
    if (mode) {
      window.clearInterval(retryTimer);
      return;
    }
    void boot();
  }, 500);

  window.setTimeout(() => window.clearInterval(retryTimer), 15_000);

  window.__seiFlowUrlTimer = window.setInterval(restartIfNeeded, 1_000);

  window.__seiFlowCleanup = () => {
    destroyed = true;
    cleanup?.();
    cleanup = null;
    window.clearInterval(window.__seiFlowUrlTimer);
    window.clearInterval(retryTimer);
    delete window.__seiFlowInjected;
    delete window.__seiFlowCleanup;
    delete window.__seiFlowUrlTimer;
  };
});
