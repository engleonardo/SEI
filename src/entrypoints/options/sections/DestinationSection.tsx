import { useEffect, useState } from 'react';
import type { Settings, TrelloBoard, TrelloList } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { Modal } from '../../../ui/components/Modal';
import { EmptyState, SectionCard, Spinner, StatusPill, type Notice } from './shared';

export function DestinationSection({
  settings,
  boards,
  reloadBoards,
  save,
  notify,
  onSaved,
}: {
  settings: Settings;
  boards: TrelloBoard[];
  reloadBoards: () => Promise<Settings | null>;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
  onSaved?: (settings: Settings) => void;
}) {
  const [boardId, setBoardId] = useState(settings.defaultBoardId);
  const [listId, setListId] = useState(settings.defaultListId);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [boardDialog, setBoardDialog] = useState<'create' | 'rename' | null>(null);
  const [boardName, setBoardName] = useState('');
  const [boardBusy, setBoardBusy] = useState(false);

  const [connected, setConnected] = useState(Boolean(settings.appKey && settings.appToken));

  useEffect(() => {
    let active = true;
    callRpc('auth:status', undefined)
      .then((status) => {
        if (active) setConnected(status.connected);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settings.appKey, settings.appToken, settings.skipTrello]);

  useEffect(() => {
    if (!boardId && settings.defaultBoardId) setBoardId(settings.defaultBoardId);
    if (!boardId && boards.length > 0) setBoardId(boards[0]?.id ?? '');
  }, [boards, boardId, settings.defaultBoardId]);

  useEffect(() => {
    if (!boardId) {
      setLists([]);
      return;
    }
    let active = true;
    setLoadingLists(true);
    callRpc('trello:lists', { boardId, fresh: true })
      .then((value) => {
        if (!active) return;
        setLists(value);
        setListId((previous) =>
          value.some((list) => list.id === previous)
            ? previous
            : value.some((list) => list.id === settings.defaultListId)
              ? settings.defaultListId
              : (value[0]?.id ?? ''),
        );
      })
      .catch((cause) => {
        if (active) notify({ kind: 'error', text: errorMessage(cause) });
      })
      .finally(() => {
        if (active) setLoadingLists(false);
      });
    return () => {
      active = false;
    };
  }, [boardId, notify, settings.defaultListId]);

  const selectedBoard = boards.find((board) => board.id === boardId) ?? null;
  const selectedList = lists.find((list) => list.id === listId) ?? null;
  const configured = settings.defaultBoardId && settings.defaultListId;
  const dirty =
    boardId !== settings.defaultBoardId ||
    listId !== settings.defaultListId ||
    selectedBoard?.name !== settings.defaultBoardName ||
    selectedList?.name !== settings.defaultListName;

  const saveDestination = async () => {
    if (!selectedBoard || !selectedList) return;
    setBusy(true);
    try {
      const updated = await save({
        defaultBoardId: selectedBoard.id,
        defaultBoardName: selectedBoard.name,
        defaultListId: selectedList.id,
        defaultListName: selectedList.name,
      });
      notify({ kind: 'success', text: 'Quadro e lista padrão atualizados.' });
      onSaved?.(updated);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const openCreateBoard = () => {
    setBoardName('');
    setBoardDialog('create');
  };

  const openRenameBoard = () => {
    if (!selectedBoard) return;
    setBoardName(selectedBoard.name);
    setBoardDialog('rename');
  };

  const submitBoard = async () => {
    const name = boardName.trim();
    if (!name || !boardDialog) return;
    setBoardBusy(true);
    try {
      if (boardDialog === 'create') {
        const created = await callRpc('trello:create-board', { name });
        await reloadBoards();
        setBoardId(created.id);
        setListId('');
        notify({ kind: 'success', text: 'Quadro criado. Escolha a lista padrão.' });
      } else if (selectedBoard) {
        const updated = await callRpc('trello:rename-board', {
          boardId: selectedBoard.id,
          name,
        });
        if (settings.defaultBoardId === updated.id) {
          await save({ defaultBoardName: updated.name });
        }
        await reloadBoards();
        notify({ kind: 'success', text: 'Quadro renomeado.' });
      }
      setBoardDialog(null);
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBoardBusy(false);
    }
  };

  return (
    <>
      <SectionCard
        title="Quadro e lista padrão"
        subtitle="Destino principal dos cartões criados a partir do SEI. Você ainda pode mover cada cartão individualmente."
        icon="board"
        footer={
          <>
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={() => void saveDestination()}
              disabled={busy || !selectedBoard || !selectedList || !dirty}
            >
              {busy ? <Spinner /> : <Icon name="check" size={14} />}
              Salvar destino
            </button>
            <button type="button" className="sfo-btn" onClick={() => void reloadBoards()} disabled={busy}>
              <Icon name="refresh" size={14} />
              Atualizar quadros
            </button>
            <span style={{ flex: 1 }} />
            {configured ? (
              <StatusPill tone="success">
                <Icon name="check" size={11} />
                {settings.defaultBoardName} / {settings.defaultListName}
              </StatusPill>
            ) : (
              <StatusPill tone="warning">
                <Icon name="alert" size={11} />
                Não configurado
              </StatusPill>
            )}
          </>
        }
      >
        {!connected && (
          <div className="sfo-alert sfo-alert--warning">
            <Icon name="alert" size={16} />
            <div>Conecte o Trello na aba “Conexão” para carregar seus quadros.</div>
          </div>
        )}

        {connected && boards.length === 0 && (
          <>
            <EmptyState>
              Nenhum quadro aberto encontrado. Crie um quadro agora ou verifique as credenciais e clique em
              “Atualizar quadros”.
            </EmptyState>
            <div className="sfo-actions">
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={openCreateBoard}
                disabled={busy || boardBusy}
              >
                <Icon name="plus" size={13} />
                Novo quadro
              </button>
              <button
                type="button"
                className="sfo-btn sfo-btn--sm"
                onClick={() => void reloadBoards()}
                disabled={busy}
              >
                <Icon name="refresh" size={13} />
                Atualizar quadros
              </button>
            </div>
          </>
        )}

        {connected && boards.length > 0 && (
          <div className="sfo-grid-2">
            <div className="sfo-field">
              <label htmlFor="sfo-board">Quadro padrão</label>
              <select
                id="sfo-board"
                className="sfo-select"
                value={boardId}
                onChange={(event) => {
                  setBoardId(event.target.value);
                  setListId('');
                }}
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onClick={openCreateBoard}
                  disabled={busy || boardBusy}
                >
                  <Icon name="plus" size={13} />
                  Novo quadro
                </button>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onClick={openRenameBoard}
                  disabled={busy || boardBusy || !selectedBoard}
                >
                  <Icon name="edit" size={13} />
                  Renomear
                </button>
              </div>
            </div>

            <div className="sfo-field">
              <label htmlFor="sfo-list">Lista padrão</label>
              <select
                id="sfo-list"
                className="sfo-select"
                value={listId}
                onChange={(event) => setListId(event.target.value)}
                disabled={loadingLists || lists.length === 0}
              >
                {lists.length === 0 && <option value="">Nenhuma lista aberta</option>}
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              {loadingLists && (
                <span className="sfo-hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Spinner /> Carregando listas…
                </span>
              )}
              {!loadingLists && lists.length === 0 && boardId && (
                <span className="sfo-hint">
                  Crie uma lista aberta neste quadro no Trello e clique em “Atualizar quadros”.
                </span>
              )}
            </div>
          </div>
        )}

        {configured && (
          <div className="sfo-hint">
            Cartões criados pelo SEI entram em <strong>{settings.defaultBoardName}</strong> /{' '}
            <strong>{settings.defaultListName}</strong>. O vínculo com o processo é gravado na descrição como{' '}
            <code>SEI &lt;número&gt;</code>.
          </div>
        )}
      </SectionCard>
      {boardDialog && (
        <Modal
          title={boardDialog === 'create' ? 'Novo quadro' : 'Renomear quadro'}
          subtitle={
            boardDialog === 'create'
              ? 'O quadro será criado como privado, com listas padrão.'
              : 'O novo nome aparece no Trello e no SEI Flow.'
          }
          size="sm"
          onClose={() => {
            if (!boardBusy) setBoardDialog(null);
          }}
          footer={
            <>
              <button
                type="button"
                className="sf-btn"
                onClick={() => setBoardDialog(null)}
                disabled={boardBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="sf-btn sf-btn--primary"
                onClick={() => void submitBoard()}
                disabled={boardBusy || !boardName.trim()}
              >
                {boardBusy ? <Spinner /> : <Icon name="check" size={14} />}
                {boardDialog === 'create' ? 'Criar quadro' : 'Salvar nome'}
              </button>
            </>
          }
        >
          <div className="sf-field">
            <label htmlFor="sfo-board-name">Nome do quadro</label>
            <input
              id="sfo-board-name"
              className="sf-input"
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitBoard();
                }
              }}
              autoFocus
            />
          </div>
        </Modal>
      )}
    </>
  );
}
