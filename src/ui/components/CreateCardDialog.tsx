import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { Settings, TrelloCard } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { showToast } from '../toast';
import { Modal } from './Modal';
import { ErrorState, Spinner } from './common';

export interface CreateCardDialogProps {
  processNumber: string;
  defaultName?: string;
  onClose: () => void;
  onCreated: (card: TrelloCard) => void;
}

export function CreateCardDialog({
  processNumber,
  defaultName,
  onClose,
  onCreated,
}: CreateCardDialogProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState(defaultName ?? processNumber);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    callRpc('settings:get', undefined)
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  const configured = Boolean(settings?.defaultListId);

  const submit = async () => {
    if (!name.trim()) {
      setError('Informe o nome do cartão.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const card = await callRpc('trello:create-card', {
        name: name.trim(),
        description,
        processNumber,
      });
      showToast('Cartão criado no Trello.', 'success');
      onCreated(card);
      onClose();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Novo cartão no Trello"
      subtitle={`Vinculado ao processo ${processNumber}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {configured ? (
            <button
              type="button"
              className="sf-btn sf-btn--primary"
              onClick={() => void submit()}
              disabled={busy || !settings}
            >
              {busy ? <Spinner /> : <Icon name="plus" size={14} />}
              Criar cartão
            </button>
          ) : (
            <button
              type="button"
              className="sf-btn sf-btn--primary"
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              <Icon name="settings" size={14} />
              Abrir opções
            </button>
          )}
        </>
      }
    >
      {!settings && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span className="sf-hint">Carregando configurações…</span>
        </div>
      )}

      {settings && !configured && (
        <ErrorState
          message="Escolha um quadro e uma lista padrão nas opções antes de criar cartões."
          extra={
            <button
              type="button"
              className="sf-btn sf-btn--sm"
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              Abrir opções
            </button>
          }
        />
      )}

      {error && <ErrorState message={error} />}

      {configured && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="sf-field">
            <label htmlFor="sf-create-name">Nome</label>
            <input
              id="sf-create-name"
              className="sf-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              disabled={busy}
            />
          </div>

          <div className="sf-field">
            <label htmlFor="sf-create-desc">Descrição (opcional)</label>
            <textarea
              id="sf-create-desc"
              className="sf-textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Contexto, próximos passos, links…"
              disabled={busy}
            />
          </div>

          <div className="sf-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="board" size={14} />
            <span>
              Destino: <strong>{settings?.defaultBoardName || 'Quadro padrão'}</strong> /{' '}
              <strong>{settings?.defaultListName || 'Lista padrão'}</strong>
            </span>
          </div>
          <div className="sf-hint">
            O vínculo <code>SEI {processNumber}</code> será adicionado automaticamente à descrição.
          </div>
        </div>
      )}
    </Modal>
  );
}
