import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status = 200): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(async () => {
  await browser.storage.local.clear();
  vi.resetModules();
});

describe('login OAuth pela página de callback', () => {
  it('abre a autorização em uma aba e guarda o nonce do state', async () => {
    const { startLoginTab, OAUTH_REDIRECT_URI } = await import('./oauth');
    const { readPending } = await import('./session');
    const { decodeState } = await import('./pkce');
    const create = vi.spyOn(browser.tabs, 'create').mockResolvedValue({ id: 7 } as never);

    await startLoginTab();

    expect(create).toHaveBeenCalledTimes(1);
    const opened = new URL((create.mock.calls[0]?.[0] as { url: string }).url);
    expect(opened.origin).toBe('https://auth.atlassian.com');
    expect(opened.searchParams.get('redirect_uri')).toBe(OAUTH_REDIRECT_URI);
    expect(opened.searchParams.get('code_challenge_method')).toBe('S256');

    const state = decodeState(opened.searchParams.get('state') ?? '');
    expect(state?.m).toBe('page');
    expect(state?.r).toBe(OAUTH_REDIRECT_URI);
    expect((await readPending())?.nonce).toBe(state?.n);
  });

  it('troca o código pelo token e salva a sessão com a conta', async () => {
    const { completeOAuthCallback, OAUTH_REDIRECT_URI } = await import('./oauth');
    const { encodeState } = await import('./pkce');
    const { readPending, readSession, writePending } = await import('./session');
    await writePending({ verifier: 'verifier-1', nonce: 'nonce-1', createdAt: Date.now() });
    const state = encodeState({ n: 'nonce-1', r: OAUTH_REDIRECT_URI, m: 'page' });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('auth.atlassian.com')) {
        return jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
        });
      }
      return jsonResponse({ id: 'member-1', username: 'leo', fullName: 'Leonardo' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = await completeOAuthCallback('code-1', state);

    expect(session.accessToken).toBe('access-1');
    expect(session.refreshToken).toBe('refresh-1');
    expect(session.account).toEqual({ id: 'member-1', username: 'leo', fullName: 'Leonardo' });
    expect((await readSession())?.accessToken).toBe('access-1');
    expect(await readPending()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recusa um state com nonce diferente', async () => {
    const { completeOAuthCallback, OAUTH_REDIRECT_URI } = await import('./oauth');
    const { encodeState } = await import('./pkce');
    const { writePending } = await import('./session');
    await writePending({ verifier: 'verifier-1', nonce: 'esperado', createdAt: Date.now() });
    const state = encodeState({ n: 'outro', r: OAUTH_REDIRECT_URI, m: 'page' });

    await expect(completeOAuthCallback('code-1', state)).rejects.toThrow(/validar/);
  });

  it('ignora mensagem vinda de outra página', async () => {
    const { handleOAuthCallbackMessage, readOAuthResult } = await import('./oauth');
    const remove = vi
      .spyOn(browser.tabs, 'remove')
      .mockResolvedValue(undefined as never);

    await handleOAuthCallbackMessage(
      { code: 'code-1', state: 'state-1' },
      { url: 'https://exemplo.invalido/oauth-callback.html', tab: { id: 3 } },
    );

    expect(remove).not.toHaveBeenCalled();
    expect(await readOAuthResult()).toBeNull();
  });

  it('registra o erro do provedor e fecha a aba', async () => {
    const { handleOAuthCallbackMessage, readOAuthResult, OAUTH_REDIRECT_URI } = await import('./oauth');
    const remove = vi
      .spyOn(browser.tabs, 'remove')
      .mockResolvedValue(undefined as never);

    await handleOAuthCallbackMessage(
      { error: 'access_denied', errorDescription: 'Acesso negado pelo usuário', state: 'x' },
      { url: OAUTH_REDIRECT_URI, tab: { id: 9 } },
    );

    expect(await readOAuthResult()).toMatchObject({
      ok: false,
      error: 'Acesso negado pelo usuário',
    });
    expect(remove).toHaveBeenCalledWith(9);
  });

  it('compartilha uma única renovação em voo', async () => {
    const { refreshSession } = await import('./oauth');
    const session = { accessToken: 'antigo', refreshToken: 'refresh-1', expiresAt: 0 };
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ access_token: 'novo', refresh_token: 'refresh-2', expires_in: 3600 }),
    );

    const [first, second] = await Promise.all([
      refreshSession(session, fetchImpl as unknown as typeof fetch),
      refreshSession(session, fetchImpl as unknown as typeof fetch),
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(first.accessToken).toBe('novo');
    expect(second.accessToken).toBe('novo');
  });
});

