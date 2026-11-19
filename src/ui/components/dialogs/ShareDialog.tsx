import { useCallback, useEffect, useState } from 'react';
import type { TrelloBoard, TrelloCard, TrelloList } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { Modal } from '../Modal';
import { Spinner } from '../common';

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function ShareDialog({ card, onClose }: { card: TrelloCard; onClose: () => void }) {
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [targetBoardId, setTargetBoardId] = useState(card.idBoard);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [targetListId, setTargetListId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [boardName, setBoardName] = useState(`${card.board?.name ?? 'Quadro'} (cópia)`);
  const [copyingBoard, setCopyingBoard] = useState(false);

  useEffect(() => {
    let active = true;
    callRpc('trello:boards', { fresh: false })
      .then((value) => {
        if (active) setBoards(Array.isArray(value) ? value : []);
      })
      .catch(() => {
        if (active) setBoards([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadLists = useCallback(async (boardId: string) => {
    if (!boardId) {
      setLists([]);
      setTargetListId('');
      return;
    }
    setLoading(true);
    try {
      const value = await callRpc('trello:lists', { boardId, fresh: true });
      setLists(Array.isArray(value) ? value : []);
      setTargetListId((current) => (value.some((list) => list.id === current) ? current : ''));
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
      setLists([]);
      setTargetListId('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLists(targetBoardId);
  }, [loadLists, targetBoardId]);

  const cloneCard = async () => {
    if (!targetListId) {
      showToast('Escolha a lista de destino.', 'error');
      return;
    }
    setCopying(true);
    try {
      const clone = await callRpc('trello:copy-card', {
        cardId: card.id,
        listId: targetListId,
      });
      showToast('Cartão clonado.', 'success');
      if (clone?.shortUrl) {
        await copyText(clone.shortUrl).catch(() => undefined);
      }
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setCopying(false);
    }
  };

  const shareLink = async () => {
    try {
      await copyText(card.shortUrl);
      showToast('Link do cartão copiado.', 'success');
    } catch {
      showToast('Não foi possível copiar o link.', 'error');
    }
  };

  const copyBoard = async () => {
    if (!card.idBoard || !boardName.trim()) return;
    setCopyingBoard(true);
    try {
      const board = await callRpc('trello:copy-board', {
        boardId: card.idBoard,
        name: boardName.trim(),
      });
      showToast(`Quadro "${board.name}" copiado.`, 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setCopyingBoard(false);
    }
  };

  return (
    <Modal
      title="Compartilhar e clonar"
      subtitle={card.name}
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="sf-btn" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="sf-share">
        <section className="sf-share__section">
          <h3>Link do cartão</h3>
          <p className="sf-hint">Copie o link direto do Trello para compartilhar com outra pessoa.</p>
          <button type="button" className="sf-btn sf-btn--sm" onClick={() => void shareLink()}>
            <Icon name="copy" size={13} />
            Copiar link
          </button>
          <a
            className="sf-btn sf-btn--sm"
            href={card.shortUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" size={13} />
            Abrir no Trello
          </a>
        </section>

        <section className="sf-share__section">
          <h3>Clonar cartão</h3>
          <p className="sf-hint">
            Copia nome, descrição, datas, etiquetas, checklist e anexos quando o Trello permitir.
          </p>
          <div className="sf-share__row">
            <label className="sf-field">
              <span className="sf-label">Quadro de destino</span>
              <select
                className="sf-select"
                value={targetBoardId}
                onChange={(event) => setTargetBoardId(event.target.value)}
                aria-label="Quadro de destino"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sf-field">
              <span className="sf-label">Lista de destino</span>
              <select
                className="sf-select"
                value={targetListId}
                onChange={(event) => setTargetListId(event.target.value)}
                disabled={loading || lists.length === 0}
                aria-label="Lista de destino"
              >
                <option value="">{loading ? 'Carregando…' : 'Escolha a lista'}</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="sf-btn sf-btn--sm sf-btn--primary"
            onClick={() => void cloneCard()}
            disabled={copying || !targetListId}
          >
            {copying ? <Spinner /> : <Icon name="copy" size={13} />}
            Clonar cartão
          </button>
        </section>

        <section className="sf-share__section">
          <h3>Copiar quadro</h3>
          <p className="sf-hint">
            Cria um quadro novo com as listas e cartões deste quadro. O espelhamento contínuo não
            está incluído.
          </p>
          <div className="sf-share__row">
            <label className="sf-field" style={{ flex: 1 }}>
              <span className="sf-label">Nome do novo quadro</span>
              <input
                className="sf-input"
                value={boardName}
                onChange={(event) => setBoardName(event.target.value)}
                aria-label="Nome do novo quadro"
              />
            </label>
          </div>
          <button
            type="button"
            className="sf-btn sf-btn--sm"
            onClick={() => void copyBoard()}
            disabled={copyingBoard || !boardName.trim()}
          >
            {copyingBoard ? <Spinner /> : <Icon name="board" size={13} />}
            Copiar quadro
          </button>
        </section>
      </div>
    </Modal>
  );
}
