import { browser } from 'wxt/browser';

export const SEI_SCRIPT_FILE = '/sei-inject.js';

export async function injectSeiScript(tabId: number): Promise<void> {
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [SEI_SCRIPT_FILE],
    });
  } catch (error) {
    // A injeção pode falhar em abas restritas (chrome://, Web Store, PDF etc.).
    console.debug('[SEI Flow] Não foi possível injetar nesta aba.', error);
  }
}
