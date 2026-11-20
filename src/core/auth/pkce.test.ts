import { webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, codeChallenge, decodeState, encodeState, randomToken } from './pkce';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

describe('PKCE', () => {
  it('gera o challenge S256 do vetor da RFC 7636', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    await expect(codeChallenge(verifier)).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('gera verifier com tamanho aceito e valores diferentes', () => {
    const first = randomToken(64);
    const second = randomToken(64);
    expect(first).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(first).not.toBe(second);
  });

  it('codifica e decodifica o state', () => {
    const state = { n: 'nonce-123', r: 'https://abc.chromiumapp.org/' };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('recusa state inválido', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('nao-e-base64-json')).toBeNull();
    expect(decodeState(Buffer.from('{"n":"x"}').toString('base64url'))).toBeNull();
  });

  it('monta a URL de autorização com PKCE e escopos', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-id',
        redirectUri: 'https://example.test/callback',
        scopes: ['read:board:trello', 'offline_access'],
        state: 'state-value',
        challenge: 'challenge-value',
      }),
    );
    expect(url.origin).toBe('https://auth.atlassian.com');
    expect(url.pathname).toBe('/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/callback');
    expect(url.searchParams.get('scope')).toBe('read:board:trello offline_access');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('state')).toBe('state-value');
  });
});
