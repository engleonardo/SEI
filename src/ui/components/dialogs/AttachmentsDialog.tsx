import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { TrelloAttachment, TrelloCard } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { ConfirmDialog, Modal } from '../Modal';
import { Spinner } from '../common';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK_BYTES = 512 * 1024;
const UPLOAD_PORT = 'sei-flow-attachment';

function formatBytes(value: number | null | undefined): string {
  if (!value || value <= 0) return 'tamanho desconhecido';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function readChunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(blob);
  });
}

export function AttachmentsDialog({
  card,
  onClose,
}: {
  card: TrelloCard;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<TrelloAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<TrelloAttachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAttachments(await callRpc('trello:attachments', { cardId: card.id }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [card.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addUrl = async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      showToast('Informe uma URL http(s) válida.', 'error');
      return;
    }
    setUrlBusy(true);
    try {
      const attachment = await callRpc('trello:add-attachment-url', {
        cardId: card.id,
        url: normalized,
      });
      setAttachments((previous) => [attachment, ...previous]);
      setUrl('');
      showToast('Link anexado.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setUrlBusy(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      showToast('O arquivo passou do limite de 10MB.', 'error');
      return;
    }
    if (file.size === 0) {
      showToast('O arquivo está vazio.', 'error');
      return;
    }

    setFileBusy(true);
    setProgress(0);
    let finished = false;
    const port = browser.runtime.connect({ name: UPLOAD_PORT });
    const cleanup = () => {
      try {
        port.disconnect();
      } catch {
        // já desconectado
      }
      setFileBusy(false);
    };

    port.onMessage.addListener((message: unknown) => {
      const data = message as { type?: string; received?: number; total?: number; attachment?: TrelloAttachment; message?: string };
      if (data.type === 'progress') {
        if (data.received && data.total) setProgress(Math.round((data.received / data.total) * 100));
        return;
      }
      if (data.type === 'done' && data.attachment) {
        if (finished) return;
        finished = true;
        setAttachments((previous) => [data.attachment as TrelloAttachment, ...previous]);
        setProgress(100);
        showToast('Arquivo anexado.', 'success');
        cleanup();
        return;
      }
      if (data.type === 'error') {
        if (finished) return;
        finished = true;
        showToast(data.message || 'Falha ao enviar o arquivo.', 'error');
        cleanup();
      }
    });

    port.onDisconnect.addListener(() => {
      setFileBusy(false);
    });

    try {
      port.postMessage({
        type: 'start',
        cardId: card.id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        const chunk = await readChunk(file.slice(offset, offset + CHUNK_BYTES));
        port.postMessage({ type: 'chunk', data: chunk });
      }
      port.postMessage({ type: 'end' });
    } catch (cause) {
      if (!finished) {
        finished = true;
        showToast(errorMessage(cause), 'error');
        cleanup();
      }
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await callRpc('trello:delete-attachment', {
        cardId: card.id,
        attachmentId: confirmDelete.id,
      });
      setAttachments((previous) => previous.filter((item) => item.id !== confirmDelete.id));
      setConfirmDelete(null);
      showToast('Anexo excluído.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        title="Anexos"
        subtitle={card.name}
        size="md"
        onClose={onClose}
        footer={
          <button type="button" className="sf-btn" onClick={onClose}>
            Fechar
          </button>
        }
      >
        <div className="sf-attachments">
          <div className="sf-attachments__add">
            <div className="sf-attachments__url">
              <input
                className="sf-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void addUrl();
                  }
                }}
                placeholder="Cole um link http(s)…"
                aria-label="URL do anexo"
                disabled={urlBusy}
              />
              <button
                type="button"
                className="sf-btn sf-btn--sm"
                onClick={() => void addUrl()}
                disabled={urlBusy || !url.trim()}
              >
                {urlBusy ? <Spinner /> : <Icon name="link" size={13} />}
                Anexar link
              </button>
            </div>
            <div className="sf-attachments__file">
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadFile(file);
                }}
              />
              <button
                type="button"
                className="sf-btn sf-btn--sm sf-btn--primary"
                onClick={() => fileRef.current?.click()}
                disabled={fileBusy}
              >
                {fileBusy ? <Spinner /> : <Icon name="upload" size={13} />}
                {fileBusy ? `Enviando ${progress}%` : 'Enviar arquivo'}
              </button>
              <span className="sf-hint">Até 10MB por arquivo (limite do plano gratuito).</span>
            </div>
          </div>

          {error && <p className="sf-attachments__error">{error}</p>}
          {loading ? (
            <div className="sf-attachments__loading">
              <Spinner /> Carregando anexos…
            </div>
          ) : attachments.length === 0 ? (
            <p className="sf-hint">Nenhum anexo neste cartão.</p>
          ) : (
            <ul className="sf-attachments__list">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="sf-attachments__item">
                  <div className="sf-attachments__info">
                    <a href={attachment.url} target="_blank" rel="noreferrer">
                      <Icon name="paperclip" size={12} />
                      {attachment.name || 'Anexo'}
                    </a>
                    <span>
                      {formatBytes(attachment.bytes)}
                      {attachment.date ? ` · ${formatDate(attachment.date)}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sf-icon-btn sf-icon-btn--danger"
                    onClick={() => setConfirmDelete(attachment)}
                    title="Excluir anexo"
                    aria-label={`Excluir anexo ${attachment.name}`}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir anexo"
          message={`O anexo "${confirmDelete.name}" será removido do Trello.`}
          confirmLabel="Excluir anexo"
          tone="danger"
          busy={deleting}
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
