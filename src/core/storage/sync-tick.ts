import { browser } from 'wxt/browser';

const SYNC_TICK_KEY = 'sei-flow:sync-tick:v1';

/** Avisa as páginas da extensão (painel) de que os dados mudaram no SEI. */
export async function markSyncChanged(): Promise<void> {
  try {
    await browser.storage.local.set({ [SYNC_TICK_KEY]: Date.now() });
  } catch {
    // sincronização é otimização; falhas não devem quebrar a interface
  }
}

export function watchSyncChanges(listener: () => void): () => void {
  const onChanged = browser.storage?.onChanged;
  if (!onChanged?.addListener) return () => undefined;
  const handler = (changes: Record<string, { newValue?: unknown }>, area: string): void => {
    if (area !== 'local') return;
    if (!changes[SYNC_TICK_KEY]) return;
    listener();
  };
  onChanged.addListener(handler);
  return () => onChanged.removeListener(handler);
}
