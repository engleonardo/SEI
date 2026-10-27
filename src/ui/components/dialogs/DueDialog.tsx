import { useState } from 'react';
import type { TrelloCard } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { fromDateInputValue, toDateInputValue } from '../../utils';
import { Modal } from '../Modal';
import { Spinner } from '../common';

export function DueDialog({
  card,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  onClose: () => void;
  onChanged: (card: TrelloCard) => void;
}) {
  const [date, setDate] = useState(toDateInputValue(card.due));
  const [complete, setComplete] = useState(card.dueComplete);
  const [busy, setBusy] = useState(false);

  const save = async (clear = false) => {
    setBusy(true);
    try {
      const updated = await callRpc('trello:update-card', {
        cardId: card.id,
        patch: {
          due: clear ? null : fromDateInputValue(date),
          dueComplete: clear ? false : complete,
        },
      });
      onChanged(updated);
      showToast(clear ? 'Prazo removido.' : 'Prazo atualizado.', 'success');
      onClose();
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Data de entrega"
      subtitle={card.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          {card.due && (
            <button
              type="button"
              className="sf-btn sf-btn--danger"
              onClick={() => void save(true)}
              disabled={busy}
            >
              Remover prazo
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--primary"
            onClick={() => void save(false)}
            disabled={busy || !date}
          >
            {busy ? <Spinner /> : <Icon name="calendar" size={14} />}
            Salvar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="sf-field">
          <label htmlFor="sf-due-date">Vencimento</label>
          <input
            id="sf-due-date"
            type="date"
            className="sf-input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={busy}
          />
        </div>
        <label className="sf-checkbox">
          <input
            type="checkbox"
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            disabled={busy || !date}
          />
          Entrega concluída
        </label>
        <p className="sf-hint" style={{ margin: 0 }}>
          O prazo é salvo no cartão do Trello e aparece na lista de processos.
        </p>
      </div>
    </Modal>
  );
}
