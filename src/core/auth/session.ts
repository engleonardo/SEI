import { browser } from 'wxt/browser';

export interface OAuthAccount {
  id: string;
  username: string;
  fullName: string;
}

export interface OAuthSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  scope?: string;
  account?: OAuthAccount;
}

export interface OAuthPending {
  verifier: string;
  nonce: string;
  /** epoch ms */
  createdAt: number;
}

export interface AuthStatus {
  connected: boolean;
  mode: 'oauth' | 'token' | 'demo' | 'none';
  account?: OAuthAccount;
  expiresAt?: number;
  /** O push final do logout falhou; a configuração foi guardada localmente. */
  backupFailed?: boolean;
  /** Erro do login por callback (lido pela tela de Conexão). */
  error?: string;
}

const SESSION_KEY = 'sei-flow:oauth:v1';
const PENDING_KEY = 'sei-flow:oauth-pending:v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function asAccount(value: unknown): OAuthAccount | undefined {
  if (!isRecord(value)) return undefined;
  const { id, username, fullName } = value;
  if (typeof id !== 'string' || typeof username !== 'string') return undefined;
  return { id, username, fullName: typeof fullName === 'string' ? fullName : username };
}

function asSession(value: unknown): OAuthSession | null {
  if (!isRecord(value)) return null;
  const { accessToken, refreshToken, expiresAt, scope, account } = value;
  if (typeof accessToken !== 'string' || !accessToken) return null;
  if (typeof refreshToken !== 'string' || !refreshToken) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    scope: typeof scope === 'string' ? scope : undefined,
    account: asAccount(account),
  };
}

export async function readSession(): Promise<OAuthSession | null> {
  const stored = await browser.storage.local.get(SESSION_KEY);
  return asSession(stored?.[SESSION_KEY]);
}

export async function writeSession(session: OAuthSession): Promise<void> {
  await browser.storage.local.set({ [SESSION_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}

export async function writeAccount(account: OAuthAccount): Promise<OAuthSession | null> {
  const session = await readSession();
  if (!session) return null;
  const next = { ...session, account };
  await writeSession(next);
  return next;
}

export async function readPending(): Promise<OAuthPending | null> {
  const stored = await browser.storage.local.get(PENDING_KEY);
  const value = stored?.[PENDING_KEY];
  if (!isRecord(value)) return null;
  const { verifier, nonce, createdAt } = value;
  if (typeof verifier !== 'string' || !verifier) return null;
  if (typeof nonce !== 'string' || !nonce) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return { verifier, nonce, createdAt };
}

export async function writePending(pending: OAuthPending): Promise<void> {
  await browser.storage.local.set({ [PENDING_KEY]: pending });
}

export async function clearPending(): Promise<void> {
  await browser.storage.local.remove(PENDING_KEY);
}

/** Considera expirado com margem para evitar 401 em requisições em voo. */
export function isExpiring(session: OAuthSession, skewMs = 60_000): boolean {
  return session.expiresAt - Date.now() <= skewMs;
}
