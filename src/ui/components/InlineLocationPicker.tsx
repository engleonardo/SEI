import { useEffect, useState } from 'react';
import type { TrelloBoard, TrelloCard, TrelloList } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { showToast } from '../toast';
import { Spinner } from './common';

export function InlineLocationPicker({
  card,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  onClose: () => void;
  onChanged: (card: TrelloCard) => void;
}) {
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [boardId, setBoardId] = useState(card.idBoard);
  const [listId, setListId] = useState(card.idList);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidated, setInvalidated] = useState(false);

  useEffect(() => {
    let active = true;
    callRpc('trello:boards', undefined)
      .then((value) => {
        if (!active) return;
        setBoards(value);
        const nextBoard = value.find((board) => board.id === card.idBoard) ?? value[0];
        if (nextBoard) setBoardId(nextBoard.id);
      })
      .catch((cause) => {
        if (!active) return;
        setError(errorMessage(cause));
        setInvalidated(errorCode(cause) === 'context_invalidated');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.idBoard]);

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    callRpc('trello:lists', { boardId })
      .then((value) => {
        if (!active) return;
        setLists(value);
        setListId((previous) =>
          value.some((list) => list.id === previous) ? previous : (value[0]?.id ?? ''),
        );
      })
      .catch((cause) => {
        if (!active) return;
        setError(errorMessage(cause));
        setInvalidated(errorCode(cause) === 'context_invalidated');
      });
    return () => {
      active = false;
    };
  }, [boardId]);

  const save = async () => {
    if (!boardId || !listId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await callRpc('trello:update-card', {
        cardId: card.id,
        patch: { idBoard: boardId, idList: listId },
      });
      onChanged(updated);
      showToast('Cartão movido.', 'success');
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
      setInvalidated(errorCode(cause) === 'context_invalidated');
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const changed = boardId !== card.idBoard || listId !== card.idList;

  return (
    <div className="sf-location-picker">
      <div className="sf-location-picker__head">
        <Icon name="board" size={14} />
        <strong>Mover cartão</strong>
        <span className="sf-location-picker__current">
          {card.board?.name ?? 'Quadro'} » {card.list?.name ?? 'Lista'}
        </span>
        <button
          type="button"
          className="sf-icon-btn"
          onClick={onClose}
          aria-label="Fechar seletor de quadro e lista"
          title="Fechar"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {loading ? (
        <div className="sf-location-picker__loading">
          <Spinner />
          <span className="sf-hint">Carregando quadros…</span>
        </div>
      ) : (
        <div className="sf-location-picker__grid">
          <div className="sf-field">
            <label htmlFor="sf-location-board">Quadro</label>
            <select
              id="sf-location-board"
              className="sf-select"
              value={boardId}
              onChange={(event) => {
                setBoardId(event.target.value);
                setListId('');
              }}
              disabled={busy}
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-field">
            <label htmlFor="sf-location-list">Lista</label>
            <select
              id="sf-location-list"
              className="sf-select"
              value={listId}
              onChange={(event) => setListId(event.target.value)}
              disabled={busy || lists.length === 0}
            >
              {lists.length === 0 && <option value="">Nenhuma lista aberta</option>}
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="sf-location-picker__error">
          <Icon name="alert" size={13} />
          <span>{error}</span>
          {invalidated && (
            <button type="button" className="sf-btn sf-btn--sm" onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          )}
        </div>
      )}

      <div className="sf-location-picker__actions">
        <button type="button" className="sf-btn sf-btn--sm" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className="sf-btn sf-btn--primary sf-btn--sm"
          onClick={() => void save()}
          disabled={busy || !changed || !boardId || !listId}
        >
          {busy ? <Spinner /> : <Icon name="check" size={13} />}
          Mover
        </button>
      </div>
    </div>
  );
}
