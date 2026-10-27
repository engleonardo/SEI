const API_BASE = 'https://api.trello.com/1';

export type TrelloErrorCode =
  | 'not_configured'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'rate_limit'
  | 'network'
  | 'server'
  | 'validation'
  | 'unknown';

export class TrelloError extends Error {
  readonly code: TrelloErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(code: TrelloErrorCode, message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'TrelloError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface TrelloCredentials {
  key: string;
  token: string;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;

function sanitizeMessage(value: string): string {
  return value
    .replace(/key=[^&\s]+/gi, 'key=***')
    .replace(/token=[^&\s]+/gi, 'token=***')
    .slice(0, 300)
    .trim();
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function errorFromResponse(status: number, body: string, response: Response): TrelloError {
  const message = sanitizeMessage(body) || `Erro HTTP ${status} na API do Trello.`;
  if (status === 401 || status === 403) {
    return new TrelloError('auth', 'Credenciais do Trello inválidas ou sem permissão.', status);
  }
  if (status === 404) return new TrelloError('not_found', 'Item não encontrado no Trello.', status);
  if (status === 429) {
    return new TrelloError(
      'rate_limit',
      'Limite de requisições do Trello atingido. Tente novamente em alguns segundos.',
      status,
      retryAfterMs(response),
    );
  }
  if (status >= 500) return new TrelloError('server', 'Servidor do Trello indisponível.', status);
  if (status === 400 || status === 422) return new TrelloError('validation', message, status);
  return new TrelloError('unknown', message, status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TrelloClient {
  private readonly credentials: () => Promise<TrelloCredentials>;
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(credentials: () => Promise<TrelloCredentials>) {
    this.credentials = credentials;
  }

  get<T>(path: string, params: QueryParams = {}): Promise<T> {
    const key = `${path}?${new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => [name, String(value)]),
    ).toString()}`;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = this.request<T>('GET', path, params)
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  post<T>(path: string, body: QueryParams = {}): Promise<T> {
    return this.request<T>('POST', path, {}, body);
  }

  put<T>(path: string, body: QueryParams = {}): Promise<T> {
    return this.request<T>('PUT', path, {}, body);
  }

  delete<T>(path: string, params: QueryParams = {}): Promise<T> {
    return this.request<T>('DELETE', path, params);
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    params: QueryParams = {},
    body?: QueryParams,
  ): Promise<T> {
    const credentials = await this.credentials();
    if (!credentials.key || !credentials.token) {
      throw new TrelloError(
        'not_configured',
        'Configure a APP-KEY e o TOKEN do Trello nas opções da extensão.',
      );
    }

    let lastError: TrelloError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const url = new URL(`${API_BASE}${path}`);
      for (const [name, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        let response: Response;
        if (method === 'GET' || method === 'DELETE') {
          url.searchParams.set('key', credentials.key);
          url.searchParams.set('token', credentials.token);
          response = await fetch(url, { method, signal: controller.signal, credentials: 'omit' });
        } else {
          const form = new URLSearchParams();
          for (const [name, value] of Object.entries(body ?? {})) {
            if (value !== undefined && value !== null) form.set(name, String(value));
          }
          form.set('key', credentials.key);
          form.set('token', credentials.token);
          response = await fetch(url, {
            method,
            body: form,
            signal: controller.signal,
            credentials: 'omit',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        }

        if (response.ok) {
          if (response.status === 204) return undefined as T;
          const text = await response.text();
          if (!text) return undefined as T;
          try {
            return JSON.parse(text) as T;
          } catch {
            return text as T;
          }
        }

        const text = await response.text().catch(() => '');
        const error = errorFromResponse(response.status, text, response);
        lastError = error;

        if ((error.code === 'rate_limit' || error.code === 'server') && attempt < MAX_ATTEMPTS) {
          const delay = error.retryAfterMs ?? Math.min(8_000, 2 ** (attempt - 1) * 1_000);
          await sleep(delay);
          continue;
        }

        throw error;
      } catch (error) {
        if (error instanceof TrelloError) throw error;

        if (error instanceof DOMException && error.name === 'AbortError') {
          lastError = new TrelloError('network', 'A requisição ao Trello excedeu o tempo limite.');
        } else {
          lastError = new TrelloError(
            'network',
            'Não foi possível conectar ao Trello. Verifique sua internet.',
          );
        }

        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(8_000, 2 ** (attempt - 1) * 1_000));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new TrelloError('unknown', 'Falha inesperada ao falar com o Trello.');
  }
}
