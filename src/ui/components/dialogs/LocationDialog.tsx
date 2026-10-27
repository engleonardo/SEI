import { useEffect, useState } from 'react';
import type { TrelloBoard, TrelloCard, TrelloList } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { ErrorState, Spinner } from '../common';
import { Modal } from '../Modal';

export function LocationDialog({
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
        if (active) setError(errorMessage(cause));
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
        if (active) setError(errorMessage(cause));
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
      showToast('Localização do cartão atualizada.', 'success');
      onClose();
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const changed = boardId !== card.idBoard || listId !== card.idList;

  return (
    <Modal
      title="Mover cartão"
      subtitle={card.name}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--primary"
            onClick={() => void save()}
            disabled={busy || !changed || !boardId || !listId}
          >
            {busy ? <Spinner /> : <Icon name="arrowRight" size={14} />}
            Mover
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span className="sf-hint">Carregando quadros…</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <ErrorState message={error} />}
          <div className="sf-field">
            <label htmlFor="sf-move-board">Quadro</label>
            <select
              id="sf-move-board"
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
            <label htmlFor="sf-move-list">Lista</label>
            <select
              id="sf-move-list"
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
          <p className="sf-hint" style={{ margin: 0 }}>
            Atual: {card.board?.name ?? 'Quadro'} » {card.list?.name ?? 'Lista'}
          </p>
        </div>
      )}
    </Modal>
  );
}
