import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrelloBoard, TrelloCard, TrelloList } from '../../../core/domain/types';
import type { MirrorGroup } from '../../../core/storage/mirrors';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { classNames } from '../../utils';
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

type ShareTab = 'link' | 'duplicate' | 'board';
type DuplicateMode = 'clone' | 'mirror';

const TABS: Array<{ id: ShareTab; label: string; icon: 'link' | 'copy' | 'board' }> = [
  { id: 'link', label: 'Link', icon: 'link' },
  { id: 'duplicate', label: 'Duplicar', icon: 'copy' },
  { id: 'board', label: 'Quadro', icon: 'board' },
];

export function ShareDialog({ card, onClose }: { card: TrelloCard; onClose: () => void }) {
  const [tab, setTab] = useState<ShareTab>('link');
  const [mode, setMode] = useState<DuplicateMode>('clone');
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [targetBoardId, setTargetBoardId] = useState(card.idBoard);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [targetListId, setTargetListId] = useState('');
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [boardName, setBoardName] = useState(`${card.board?.name ?? 'Quadro'} (cópia)`);
  const [copyingBoard, setCopyingBoard] = useState(false);
  const [mirrorGroup, setMirrorGroup] = useState<MirrorGroup | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [mirrorLoading, setMirrorLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    callRpc('mirrors:status', { cardId: card.id })
      .then((value) => {
        if (active) setMirrorGroup(value);
      })
      .catch(() => {
        if (active) setMirrorGroup(null);
      })
      .finally(() => {
        if (active) setMirrorLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.id]);

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

  const loadLists = useCallback(
    async (boardId: string) => {
      if (!boardId) {
        setLists([]);
        setTargetListId('');
        return;
      }
      setLoading(true);
      try {
        const value = await callRpc('trello:lists', { boardId, fresh: true });
        const next = Array.isArray(value) ? value : [];
        setLists(next);
        setTargetListId((current) => {
          if (next.some((list) => list.id === current)) return current;
          // Facilita: sugere a lista atual do cartão quando o quadro é o mesmo.
          if (boardId === card.idBoard && next.some((list) => list.id === card.idList)) {
            return card.idList;
          }
          return '';
        });
      } catch (cause) {
        showToast(errorMessage(cause), 'error');
        setLists([]);
        setTargetListId('');
      } finally {
        setLoading(false);
      }
    },
    [card.idBoard, card.idList],
  );

  useEffect(() => {
    void loadLists(targetBoardId);
  }, [loadLists, targetBoardId]);

  const shareLink = async () => {
    try {
      await copyText(card.shortUrl);
      setLinkCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setLinkCopied(false), 2_000);
    } catch {
      showToast('Não foi possível copiar o link.', 'error');
    }
  };

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

  const mirrorCard = async () => {
    if (!targetListId) {
      showToast('Escolha a lista de destino.', 'error');
      return;
    }
    setMirroring(true);
    try {
      const result = await callRpc('trello:mirror-card', {
        cardId: card.id,
        listId: targetListId,
      });
      setMirrorGroup(result.group);
      showToast('Espelho criado. Nome e descrição serão sincronizados.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setMirroring(false);
    }
  };

  const unmirror = async () => {
    setMirroring(true);
    try {
      await callRpc('mirrors:remove', { cardId: card.id });
      setMirrorGroup(null);
      showToast('Cartão removido do espelho. Os outros cartões não foram excluídos.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setMirroring(false);
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

  const mirrored = Boolean(mirrorGroup && mirrorGroup.cardIds.length > 1);
  const busy = copying || mirroring;
  const actionDisabled = busy || !targetListId;

  return (
    <Modal
      title="Compartilhar e clonar"
      subtitle={card.name}
      onClose={onClose}
      className="sf-modal--share"
      footer={
        <button type="button" className="sf-btn" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="sf-share">
        <div className="sf-share__tabs" role="tablist" aria-label="Ações do cartão">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={classNames('sf-share__tab', tab === item.id && 'is-active')}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={14} />
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'link' && (
          <section className="sf-share__panel" role="tabpanel" aria-label="Link">
            <p className="sf-share__lead">
              Compartilhe este cartão com o link direto do Trello.
            </p>
            <div className="sf-share__link">
              <Icon name="link" size={15} />
              <span className="sf-share__link-url" title={card.shortUrl}>
                {card.shortUrl}
              </span>
            </div>
            <div className="sf-share__actions">
              <a className="sf-btn" href={card.shortUrl} target="_blank" rel="noreferrer">
                <Icon name="external" size={14} />
                Abrir no Trello
              </a>
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void shareLink()}
              >
                <Icon name={linkCopied ? 'check' : 'copy'} size={14} />
                {linkCopied ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
          </section>
        )}

        {tab === 'duplicate' && (
          <section className="sf-share__panel" role="tabpanel" aria-label="Duplicar">
            <p className="sf-share__lead">
              Escolha o destino e como quer duplicar este cartão.
            </p>

            <div className="sf-share__grid">
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

            <div className="sf-share__choices" role="radiogroup" aria-label="Tipo de duplicação">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'clone'}
                className={classNames('sf-share__choice', mode === 'clone' && 'is-active')}
                onClick={() => setMode('clone')}
              >
                <Icon name="copy" size={16} />
                <span className="sf-share__choice-body">
                  <span className="sf-share__choice-title">Cópia independente</span>
                  <span className="sf-share__choice-text">
                    Um cartão novo, sem vínculo com este.
                  </span>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'mirror'}
                className={classNames('sf-share__choice', mode === 'mirror' && 'is-active')}
                onClick={() => setMode('mirror')}
              >
                <Icon name="link" size={16} />
                <span className="sf-share__choice-body">
                  <span className="sf-share__choice-title">Espelho sincronizado</span>
                  <span className="sf-share__choice-text">
                    Mantém nome e descrição iguais.
                  </span>
                </span>
              </button>
            </div>

            {mode === 'mirror' && mirrorLoading ? (
              <p className="sf-share__status">
                <Spinner /> Verificando espelho…
              </p>
            ) : mode === 'mirror' && mirrored ? (
              <div className="sf-share__status sf-share__status--info">
                <Icon name="link" size={14} />
                <span>
                  Espelhado com {Math.max(0, (mirrorGroup?.cardIds.length ?? 1) - 1)} cartão(ões).
                </span>
                <button
                  type="button"
                  className="sf-btn sf-btn--sm"
                  onClick={() => void unmirror()}
                  disabled={mirroring}
                >
                  {mirroring ? <Spinner /> : <Icon name="unlink" size={13} />}
                  Desespelhar
                </button>
              </div>
            ) : null}

            <div className="sf-share__actions">
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void (mode === 'clone' ? cloneCard() : mirrorCard())}
                disabled={actionDisabled || (mode === 'mirror' && mirrored)}
              >
                {busy ? <Spinner /> : <Icon name={mode === 'clone' ? 'copy' : 'link'} size={14} />}
                {mode === 'clone' ? 'Clonar cartão' : 'Espelhar cartão'}
              </button>
            </div>
          </section>
        )}

        {tab === 'board' && (
          <section className="sf-share__panel" role="tabpanel" aria-label="Quadro">
            <p className="sf-share__lead">
              Cria um quadro novo com as listas e os cartões deste quadro. É uma cópia única, sem
              sincronização.
            </p>
            <label className="sf-field">
              <span className="sf-label">Nome do novo quadro</span>
              <input
                className="sf-input"
                value={boardName}
                onChange={(event) => setBoardName(event.target.value)}
                aria-label="Nome do novo quadro"
              />
            </label>
            <div className="sf-share__actions">
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void copyBoard()}
                disabled={copyingBoard || !boardName.trim()}
              >
                {copyingBoard ? <Spinner /> : <Icon name="board" size={14} />}
                Copiar quadro
              </button>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
