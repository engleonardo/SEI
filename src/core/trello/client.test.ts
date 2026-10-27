import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrelloClient, TrelloError } from './client';

const credentials = async () => ({ key: 'app-key', token: 'app-token' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TrelloClient', () => {
  it('envia credenciais e parâmetros no GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(credentials);
    await client.get('/boards/1/lists', { fields: 'id,name' });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/1/boards/1/lists');
    expect(parsed.searchParams.get('key')).toBe('app-key');
    expect(parsed.searchParams.get('token')).toBe('app-token');
    expect(parsed.searchParams.get('fields')).toBe('id,name');
    expect(init.method).toBe('GET');
  });

  it('envia credenciais e corpo no POST sem expor token na URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"card"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(credentials);
    await client.post('/cards', { name: 'Teste', desc: 'linha 1\nlinha 2' });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).not.toContain('app-token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('key')).toBe('app-key');
    expect(body.get('token')).toBe('app-token');
    expect(body.get('name')).toBe('Teste');
    expect(body.get('desc')).toBe('linha 1\nlinha 2');
  });

  it('mapeia 401 para erro de autenticação sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('invalid token', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(credentials);
    await expect(client.get('/members/me')).rejects.toMatchObject({ code: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mapeia 400 para erro de validação', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('invalid value', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(credentials);
    await expect(client.put('/cards/1', { name: '' })).rejects.toBeInstanceOf(TrelloError);
  });

  it('exige credenciais antes de chamar o fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(async () => ({ key: '', token: '' }));
    await expect(client.get('/boards')).rejects.toMatchObject({ code: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('coalesce GETs idênticos em voo', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchMock);

    const client = new TrelloClient(credentials);
    const first = client.get('/boards');
    const second = client.get('/boards');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    resolveFetch(new Response('{"ok":true}', { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
