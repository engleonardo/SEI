import { useEffect, useState } from 'react';
import type { TrelloCard, TrelloLabel } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import {
  classNames,
  labelColorHex,
  TRELLO_LABEL_COLORS,
} from '../../utils';
import { ErrorState, Spinner } from '../common';
import { Modal } from '../Modal';

export function LabelsDialog({
  card,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  onClose: () => void;
  onChanged: (card: TrelloCard) => void;
}) {
  const [labels, setLabels] = useState<TrelloLabel[]>([]);
  const [selected, setSelected] = useState<TrelloLabel[]>(card.labels);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('blue');

  useEffect(() => {
    let active = true;
    if (!card.idBoard) {
      setLoading(false);
      setError('O cartão não está associado a um quadro.');
      return;
    }
    callRpc('trello:board-labels', { boardId: card.idBoard, fresh: true })
      .then((value) => {
        if (active) setLabels(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.idBoard]);

  const isSelected = (labelId: string) => selected.some((label) => label.id === labelId);

  const refreshLabels = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const value = await callRpc('trello:board-labels', {
        boardId: card.idBoard,
        fresh: true,
      });
      setLabels(value);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = async (label: TrelloLabel) => {
    setBusy(true);
    setError(null);
    try {
      const updated = isSelected(label.id)
        ? await callRpc('trello:remove-label', { cardId: card.id, labelId: label.id })
        : await callRpc('trello:add-label', { cardId: card.id, labelId: label.id });
      setSelected(updated.labels);
      onChanged(updated);
    } catch (cause) {
      setError(errorMessage(cause));
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await callRpc('trello:create-label', {
        boardId: card.idBoard,
        name: name.trim(),
        color,
      });
      setLabels((previous) => [...previous, created]);
      setName('');
      const updated = await callRpc('trello:add-label', { cardId: card.id, labelId: created.id });
      setSelected(updated.labels);
      onChanged(updated);
      showToast('Etiqueta criada e aplicada.', 'success');
    } catch (cause) {
      setError(errorMessage(cause));
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Etiquetas"
      subtitle={card.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="sf-modal__footer-left">{selected.length} aplicada(s)</span>
          <button
            type="button"
            className="sf-btn sf-btn--sm"
            onClick={() => void refreshLabels()}
            disabled={refreshing || busy}
          >
            {refreshing ? <Spinner /> : <Icon name="refresh" size={13} />}
            Atualizar etiquetas
          </button>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span className="sf-hint">Carregando etiquetas do quadro…</span>
          </div>
        ) : error && labels.length === 0 ? (
          <ErrorState message={error} />
        ) : (
          <div className="sf-popover-list">
            {labels.length === 0 && <span className="sf-hint">Este quadro ainda não tem etiquetas.</span>}
            {labels.map((label) => {
              const active = isSelected(label.id);
              return (
                <button
                  key={label.id}
                  type="button"
                  className="sf-label-option"
                  onClick={() => void toggle(label)}
                  disabled={busy}
                  aria-pressed={active}
                  style={{ cursor: busy ? 'wait' : 'pointer' }}
                >
                  <span
                    className="sf-label-option__swatch"
                    style={{ backgroundColor: labelColorHex(label.color) }}
                  />
                  <span className="sf-label-option__name">
                    {label.name || `Etiqueta ${label.color ?? 'sem cor'}`}
                  </span>
                  <span
                    className="sf-checkbox"
                    style={{ color: active ? 'var(--sf-accent)' : 'var(--sf-muted)' }}
                  >
                    <Icon name={active ? 'check' : 'plus'} size={15} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && labels.length > 0 && <ErrorState message={error} />}

        <div className="sf-field" style={{ borderTop: '1px solid var(--sf-border)', paddingTop: 12 }}>
          <span className="sf-label">Criar nova etiqueta</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="sf-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da etiqueta"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void createAndAdd();
                }
              }}
            />
            <button
              type="button"
              className="sf-btn sf-btn--primary"
              onClick={() => void createAndAdd()}
              disabled={busy || !name.trim()}
            >
              <Icon name="plus" size={14} />
              Criar
            </button>
          </div>
          <div className="sf-color-grid" style={{ marginTop: 6 }}>
            {TRELLO_LABEL_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                className={classNames('sf-color-swatch', option === color && 'sf-color-swatch--active')}
                style={{ backgroundColor: labelColorHex(option) }}
                onClick={() => setColor(option)}
                disabled={busy}
                aria-label={`Cor ${option}`}
                aria-pressed={option === color}
                title={option}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
