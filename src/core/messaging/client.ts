import { browser } from 'wxt/browser';
import type { RpcMap, RpcResponse, RpcType } from './contract';

export class RpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
  }
}

export async function callRpc<T extends RpcType>(
  type: T,
  payload: RpcMap[T]['payload'],
): Promise<RpcMap[T]['result']> {
  const runtime = (browser as typeof browser | undefined)?.runtime as
    | { sendMessage?: (message: unknown) => Promise<unknown> }
    | undefined;

  if (!runtime?.sendMessage) {
    throw new RpcError(
      'context_invalidated',
      'A extensão foi atualizada ou recarregada. Recarregue a página do SEI e tente novamente.',
    );
  }

  let response: RpcResponse<RpcMap[T]['result']> | undefined;
  try {
    response = (await runtime.sendMessage({
      rpc: type,
      payload,
    })) as RpcResponse<RpcMap[T]['result']> | undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha de comunicação com a extensão.';
    const invalidated = /Extension context invalidated|message port closed|Receiving end does not exist/i.test(
      message,
    );
    throw new RpcError(
      invalidated ? 'context_invalidated' : 'background_unreachable',
      invalidated
        ? 'A extensão foi atualizada ou recarregada. Recarregue a página do SEI e tente novamente.'
        : message,
    );
  }

  if (!response) throw new RpcError('empty_response', 'A extensão não respondeu.');
  if (!response.ok) throw new RpcError(response.error.code, response.error.message);
  return response.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof RpcError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocorreu um erro inesperado.';
}

export function errorCode(error: unknown): string {
  if (error instanceof RpcError) return error.code;
  return 'unknown';
}
