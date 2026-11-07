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
  const [start, setStart] = useState(toDateInputValue(card.start));
  const [due, setDue] = useState(toDateInputValue(card.due));
  const [complete, setComplete] = useState(card.dueComplete);
  const [busy, setBusy] = useState(false);
  const hasDates = Boolean(card.start || card.due);

  const save = async (clear = false) => {
    const startValue = clear ? null : fromDateInputValue(start);
    const dueValue = clear ? null : fromDateInputValue(due);

    if (startValue && dueValue && new Date(startValue).getTime() > new Date(dueValue).getTime()) {
      showToast('A data de início não pode ser posterior ao vencimento.', 'error');
      return;
    }

    setBusy(true);
    try {
      const updated = await callRpc('trello:update-card', {
        cardId: card.id,
        patch: {
          start: startValue,
          due: dueValue,
          dueComplete: dueValue ? complete : false,
        },
      });
      onChanged(updated);
      showToast(clear ? 'Datas removidas.' : 'Datas atualizadas.', 'success');
      onClose();
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Datas do cartão"
      subtitle={card.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          {hasDates && (
            <button
              type="button"
              className="sf-btn sf-btn--danger"
              onClick={() => void save(true)}
              disabled={busy}
            >
              <Icon name="trash" size={14} />
              Limpar datas
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
            disabled={busy || (!start && !due && !hasDates)}
          >
            {busy ? <Spinner /> : <Icon name="calendar" size={14} />}
            Salvar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="sf-create__grid">
          <div className="sf-field">
            <label htmlFor="sf-start-date">Início (opcional)</label>
            <input
              id="sf-start-date"
              type="date"
              className="sf-input"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="sf-field">
            <label htmlFor="sf-due-date">Vencimento (opcional)</label>
            <input
              id="sf-due-date"
              type="date"
              className="sf-input"
              value={due}
              onChange={(event) => {
                const value = event.target.value;
                setDue(value);
                if (!value) setComplete(false);
              }}
              disabled={busy}
            />
          </div>
        </div>

        <label className="sf-checkbox">
          <input
            type="checkbox"
            checked={complete}
            onChange={(event) => setComplete(event.target.checked)}
            disabled={busy || !due}
          />
          Entrega concluída
        </label>

        <p className="sf-hint" style={{ margin: 0 }}>
          Início e vencimento ficam gravados no cartão do Trello. Deixe um campo vazio para removê-lo.
        </p>
      </div>
    </Modal>
  );
}
