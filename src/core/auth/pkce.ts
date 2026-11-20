/**
 * Utilidades puras do OAuth 2.0 (sem APIs do navegador) para poderem ser testadas.
 */

const AUTHORIZE_ENDPOINT = 'https://auth.atlassian.com/authorize';

export interface OAuthState {
  /** nonce contra CSRF */
  n: string;
  /** URL de retorno da extensão */
  r: string;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '===='.slice(0, padding));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** 32 bytes aleatórios em base64url (43 caracteres). */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

/** code_challenge = BASE64URL(SHA256(verifier)) - PKCE S256. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlFromBytes(new Uint8Array(digest));
}

export function encodeState(state: OAuthState): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(state)));
}

export function decodeState(value: string): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const { n, r } = parsed as Partial<OAuthState>;
    if (typeof n !== 'string' || !n) return null;
    if (typeof r !== 'string' || !r) return null;
    return { n, r };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('scope', options.scopes.join(' '));
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('state', options.state);
  return url.toString();
}
