import { browser } from 'wxt/browser';
import { TrelloRepository } from '../trello/repository';

const PORT_NAME = 'sei-flow-attachment';
const MAX_BYTES = 10 * 1024 * 1024;

interface UploadMeta {
  cardId: string;
  name: string;
  mimeType: string;
  size: number;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Falha ao enviar o anexo.';
}

/**
 * Upload de anexos em chunks via port. Evita o limite de mensagem do
 * runtime.sendMessage e não guarda o arquivo no storage.
 */
export function registerAttachmentUploadPort(): void {
  const repository = new TrelloRepository();

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;

    let meta: UploadMeta | null = null;
    let chunks: Uint8Array[] = [];
    let received = 0;

    const safePost = (message: unknown) => {
      try {
        port.postMessage(message);
      } catch {
        // porta fechada pelo dashboard
      }
    };

    const reset = () => {
      meta = null;
      chunks = [];
      received = 0;
    };

    const handle = async (message: unknown) => {
      if (!message || typeof message !== 'object') return;
      const data = message as Record<string, unknown>;
      if (data.type === 'start') {
        const cardId = typeof data.cardId === 'string' ? data.cardId : '';
        const name = typeof data.name === 'string' ? data.name : 'arquivo';
        const mimeType =
          typeof data.mimeType === 'string' && data.mimeType
            ? data.mimeType
            : 'application/octet-stream';
        const size = typeof data.size === 'number' ? data.size : 0;
        if (!cardId || size <= 0 || size > MAX_BYTES) {
          safePost({ type: 'error', message: 'Arquivo inválido ou acima de 10MB.' });
          port.disconnect();
          return;
        }
        meta = { cardId, name, mimeType, size };
        chunks = [];
        received = 0;
        safePost({ type: 'ready' });
        return;
      }

      if (data.type === 'chunk') {
        if (!meta) return;
        const encoded = typeof data.data === 'string' ? data.data : '';
        if (!encoded) return;
        let chunk: Uint8Array;
        try {
          chunk = decodeBase64(encoded);
        } catch {
          safePost({ type: 'error', message: 'Falha ao ler o arquivo.' });
          port.disconnect();
          return;
        }
        received += chunk.length;
        if (received > MAX_BYTES) {
          safePost({ type: 'error', message: 'O arquivo passou do limite de 10MB.' });
          port.disconnect();
          return;
        }
        chunks.push(chunk);
        safePost({ type: 'progress', received, total: meta.size });
        return;
      }

      if (data.type === 'end') {
        const current = meta;
        if (!current) return;
        try {
          const bytes = concatChunks(chunks, received);
          const attachment = await repository.addAttachmentFile(
            current.cardId,
            bytes,
            current.name,
            current.mimeType,
          );
          safePost({ type: 'done', attachment });
        } catch (error) {
          safePost({ type: 'error', message: errorMessage(error) });
        } finally {
          reset();
          port.disconnect();
        }
      }
    };

    port.onMessage.addListener((message: unknown) => {
      void handle(message);
    });
    port.onDisconnect.addListener(reset);
  });
}
