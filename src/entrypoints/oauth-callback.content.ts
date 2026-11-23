import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';

/**
 * A página de callback do OAuth roda no GitHub Pages. Este content script
 * entrega o código/estado para o background e evita depender de uma URL de
 * retorno por instalação do navegador.
 */
export default defineContentScript({
  matches: ['https://engleonardo.github.io/SEI/oauth-callback.html*'],
  runAt: 'document_start',
  main() {
    const params = new URLSearchParams(location.search);
    const state = params.get('state');
    if (!state) return;

    const error = params.get('error');
    if (error) {
      void browser.runtime
        .sendMessage({
          type: 'sei-flow:oauth-callback',
          error,
          errorDescription: params.get('error_description') ?? '',
          state,
        })
        .catch(() => undefined);
      return;
    }

    const code = params.get('code');
    if (!code) return;

    void browser.runtime
      .sendMessage({ type: 'sei-flow:oauth-callback', code, state })
      .catch(() => undefined);
  },
});
