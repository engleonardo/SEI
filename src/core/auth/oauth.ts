import { browser } from 'wxt/browser';
import { TrelloError } from '../trello/client';
import { buildAuthorizeUrl, codeChallenge, decodeState, encodeState, randomToken } from './pkce';
import {
  clearPending,
  clearSession,
  isExpiring,
  readPending,
  readSession,
  writePending,
  writeSession,
  type OAuthAccount,
  type OAuthSession,
} from './session';

/**
 * Cliente público criado em https://trello.com/apps/admin (aba OAuth 2.0).
 * É público por definição: não existe client secret nesta extensão.
 * Se o login retornar `invalid_client`, confira o valor com o botão "Copiar".
 */
export const OAUTH_CLIENT_ID = 'VVXJc2IKaHxJm5AG3gCRCydxIBjUKpW4';

/** Precisa ser idêntica à URL registrada no app do Trello (sem barra final). */
export const OAUTH_REDIRECT_URI = 'https://engleonardo.github.io/SEI/oauth-callback.html';

/** Precisa estar habilitado no app do Trello; `offline_access` gera o refresh token. */
export const OAUTH_SCOPES = [
  'read:board:trello',
  'write:board:trello',
  'read:member:trello',
  'write:member:trello',
  'write:board:membership:trello',
  'read:organization:trello',
  'write:organization:trello',
  'offline_access',
];

const TOKEN_ENDPOINT = 'https://auth.atlassian.com/oauth/token';
const PENDING_TTL_MS = 10 * 60_000;
const RESULT_KEY = 'sei-flow:oauth:result:v1';

export interface OAuthResult {
  ok: boolean;
  error?: string;
  at: number;
}

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
  error?: unknown;
}

function tokenError(status: number, payload: TokenPayload | null): TrelloError {
  const error = typeof payload?.error === 'string' ? payload.error : '';
  if (error === 'invalid_grant') {
    return new TrelloError('auth', 'Sessão do Trello expirada. Entre novamente.', status);
  }
  if (error === 'invalid_client') {
    return new TrelloError('validation', 'Cliente OAuth inválido. Confira o Client ID.', status);
  }
  if (error === 'invalid_scope') {
    return new TrelloError(
      'validation',
      'O app do Trello não tem todos os escopos solicitados habilitados.',
      status,
    );
  }
  if (status >= 500) return new TrelloError('server', 'Login do Trello indisponível.', status);
  return new TrelloError('unknown', 'Não foi possível concluir o login com o Trello.', status);
}

async function requestTokens(
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: number; scope?: string }> {
  let response: Response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(params),
      credentials: 'omit',
    });
  } catch {
    throw new TrelloError('network', 'Não foi possível falar com o login do Trello.');
  }

  const text = await response.text().catch(() => '');
  let payload: TokenPayload | null = null;
  try {
    payload = text ? (JSON.parse(text) as TokenPayload) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) throw tokenError(response.status, payload);

  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : '';
  const expiresIn = typeof payload?.expires_in === 'number' ? payload.expires_in : 0;
  if (!accessToken || !expiresIn) {
    throw new TrelloError('unknown', 'O Trello não devolveu um token válido.');
  }

  return {
    accessToken,
    refreshToken:
      typeof payload?.refresh_token === 'string' && payload.refresh_token ? payload.refresh_token : undefined,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof payload?.scope === 'string' ? payload.scope : undefined,
  };
}

export async function readOAuthResult(): Promise<OAuthResult | null> {
  const stored = await browser.storage.local.get(RESULT_KEY);
  const value = stored?.[RESULT_KEY] as Partial<OAuthResult> | undefined;
  if (!value || typeof value.at !== 'number') return null;
  return {
    ok: value.ok === true,
    error: typeof value.error === 'string' ? value.error : undefined,
    at: value.at,
  };
}

export async function clearOAuthResult(): Promise<void> {
  await browser.storage.local.remove(RESULT_KEY);
}

async function writeOAuthResult(result: OAuthResult): Promise<void> {
  await browser.storage.local.set({ [RESULT_KEY]: result });
}

async function fetchAccount(accessToken: string): Promise<OAuthAccount | null> {
  try {
    const response = await fetch('https://api.trello.com/1/members/me?fields=id,username,fullName', {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      id?: unknown;
      username?: unknown;
      fullName?: unknown;
    };
    if (typeof data.id !== 'string' || typeof data.username !== 'string') return null;
    return {
      id: data.id,
      username: data.username,
      fullName: typeof data.fullName === 'string' ? data.fullName : data.username,
    };
  } catch {
    return null;
  }
}

/** Abre a autorização em uma aba; a página de callback entrega o código. */
export async function startLoginTab(): Promise<void> {
  const verifier = randomToken(64);
  const challenge = await codeChallenge(verifier);
  const nonce = randomToken(16);
  const state = encodeState({ n: nonce, r: OAUTH_REDIRECT_URI, m: 'page' });

  await writePending({ verifier, nonce, createdAt: Date.now() });
  await clearOAuthResult();

  const url = buildAuthorizeUrl({
    clientId: OAUTH_CLIENT_ID,
    redirectUri: OAUTH_REDIRECT_URI,
    scopes: OAUTH_SCOPES,
    state,
    challenge,
  });
  await browser.tabs.create({ url });
}

/** Troca o código recebido pela página de callback e salva a sessão. */
export async function completeOAuthCallback(code: string, state: string): Promise<OAuthSession> {
  const returned = decodeState(state);
  const pending = await readPending();
  if (
    !returned ||
    returned.m !== 'page' ||
    !pending ||
    returned.n !== pending.nonce ||
    Date.now() - pending.createdAt > PENDING_TTL_MS
  ) {
    await clearPending();
    throw new TrelloError('auth', 'Não foi possível validar a resposta do Trello.');
  }

  const tokens = await requestTokens({
    grant_type: 'authorization_code',
    client_id: OAUTH_CLIENT_ID,
    code,
    redirect_uri: OAUTH_REDIRECT_URI,
    code_verifier: pending.verifier,
  });

  await clearPending();

  const session: OAuthSession = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? '',
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };

  if (!session.refreshToken) {
    throw new TrelloError(
      'auth',
      'O Trello não devolveu o refresh token. Verifique o escopo offline_access.',
    );
  }

  const account = await fetchAccount(session.accessToken);
  if (account) session.account = account;

  await writeSession(session);
  await writeOAuthResult({ ok: true, at: Date.now() });
  return session;
}

/** Mensagem enviada pelo content script da página de callback. */
export async function handleOAuthCallbackMessage(
  message: { code?: unknown; state?: unknown; error?: unknown; errorDescription?: unknown },
  sender: { url?: string; tab?: { id?: number } },
): Promise<boolean> {
  if (!sender.url?.startsWith(OAUTH_REDIRECT_URI)) return false;

  const providerError = typeof message.error === 'string' ? message.error : '';
  if (providerError) {
    await clearPending();
    const description =
      typeof message.errorDescription === 'string' && message.errorDescription
        ? message.errorDescription
        : `O Trello não autorizou o acesso (${providerError}).`;
    await writeOAuthResult({ ok: false, error: description, at: Date.now() });
    if (sender.tab?.id) {
      await browser.tabs.remove(sender.tab.id).catch(() => undefined);
    }
    return false;
  }

  const code = typeof message.code === 'string' ? message.code : '';
  const state = typeof message.state === 'string' ? message.state : '';
  if (!code || !state) return false;

  try {
    await completeOAuthCallback(code, state);
    return true;
  } catch (error) {
    await writeOAuthResult({
      ok: false,
      error: error instanceof Error ? error.message : 'Falha no login com o Trello.',
      at: Date.now(),
    });
    return false;
  } finally {
    if (sender.tab?.id) {
      await browser.tabs.remove(sender.tab.id).catch(() => undefined);
    }
  }
}

async function refreshSessionInternal(session: OAuthSession, fetchImpl: typeof fetch): Promise<OAuthSession> {
  const tokens = await requestTokens(
    {
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      refresh_token: session.refreshToken,
    },
    fetchImpl,
  ).catch(async (error: unknown) => {
    if (error instanceof TrelloError && error.code === 'auth') {
      await clearSession();
    }
    throw error;
  });

  const next: OAuthSession = {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? session.refreshToken,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope ?? session.scope,
  };
  await writeSession(next);
  return next;
}

let refreshInFlight: Promise<OAuthSession> | null = null;

/**
 * O refresh token é rotativo: duas renovações simultâneas com o mesmo token
 * fazem uma delas falhar e derrubar a sessão. Compartilha a renovação em voo.
 */
export function refreshSession(
  session: OAuthSession,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthSession> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshSessionInternal(session, fetchImpl).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Token válido para as chamadas ao Trello (renova quando está perto de expirar). */
export async function getAccessToken(): Promise<string> {
  const session = await readSession();
  if (!session) {
    throw new TrelloError('not_configured', 'Entre com o Trello para continuar.');
  }
  if (!isExpiring(session)) return session.accessToken;
  const refreshed = await refreshSession(session);
  return refreshed.accessToken;
}

export async function logout(): Promise<void> {
  await clearSession();
  await clearPending();
}
