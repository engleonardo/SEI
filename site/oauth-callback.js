/**
 * Callback estático do OAuth 2.0 do SEI Flow.
 *
 * Contrato com a extensão:
 *   state = base64url(JSON.stringify({ n: <nonce>, r: <returnUrl> }))
 *
 *   - n: nonce gerado pela extensão (validado na volta);
 *   - r: URL de retorno da extensão
 *        (https://<id>.chromiumapp.org/ no Chrome/Edge
 *         ou https://<id>.extensions.allizom.org/ no Firefox).
 *
 * A página NÃO guarda segredo, não fala com API e não registra o código:
 * apenas valida o formato do retorno (allowlist de domínio) e devolve
 * code + state para a extensão. A troca do código por token acontece
 * dentro da extensão, com o code_verifier do PKCE.
 */
(function () {
  'use strict';

  var ALLOWED_SUFFIXES = ['.chromiumapp.org', '.extensions.allizom.org'];

  var message = document.getElementById('message');
  var hint = document.getElementById('hint');

  function fail(text, detail) {
    message.textContent = text;
    message.className = 'message message--error';
    if (detail) {
      hint.textContent = detail;
      hint.hidden = false;
    }
    // Evita deixar o código de autorização no histórico/barra de endereços.
    try {
      history.replaceState(null, '', location.pathname);
    } catch {
      /* ignora */
    }
  }

  function decodeState(value) {
    if (!value) return null;
    var normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    var padding = (4 - (normalized.length % 4)) % 4;
    var binary = atob(normalized + '===='.slice(0, padding));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    var parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  function safeReturnUrl(value) {
    if (typeof value !== 'string') return null;

    var url;
    try {
      url = new URL(value);
    } catch {
      return null;
    }

    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (url.port) return null;

    var hostname = url.hostname.toLowerCase();
    var allowed = ALLOWED_SUFFIXES.some(function (suffix) {
      return hostname.length > suffix.length && hostname.slice(-suffix.length) === suffix;
    });

    return allowed ? url : null;
  }

  var params = new URLSearchParams(location.search);
  var code = params.get('code');
  var state = params.get('state');
  var error = params.get('error');
  var errorDescription = params.get('error_description');

  if (error) {
    fail(
      'O Trello não autorizou o acesso.',
      errorDescription || 'Feche esta janela e tente entrar novamente pelo SEI Flow.',
    );
    return;
  }

  if (!code) {
    fail(
      'O Trello não devolveu o código de autorização.',
      'Feche esta janela e tente entrar novamente pelo SEI Flow.',
    );
    return;
  }

  var data = null;
  try {
    data = decodeState(state);
  } catch {
    data = null;
  }

  if (!data || typeof data.n !== 'string' || !data.n) {
    fail(
      'Não foi possível validar a resposta do Trello.',
      'O estado do login está ausente ou inválido. Feche esta janela e tente novamente.',
    );
    return;
  }

  var target = safeReturnUrl(data.r);
  if (!target) {
    fail(
      'Não foi possível concluir o login.',
      'A extensão informou um endereço de retorno inválido. Atualize o SEI Flow e tente novamente.',
    );
    return;
  }

  target.searchParams.set('code', code);
  target.searchParams.set('state', state);

  message.textContent = 'Login confirmado. Concluindo…';
  location.replace(target.toString());
})();
