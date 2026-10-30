import { useEffect, useState } from 'react';
import type { Settings, TrelloBoard, TrelloList } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { EmptyState, SectionCard, Spinner, StatusPill, type Notice } from './shared';

export function DestinationSection({
  settings,
  boards,
  reloadBoards,
  save,
  notify,
}: {
  settings: Settings;
  boards: TrelloBoard[];
  reloadBoards: () => Promise<void>;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
}) {
  const [boardId, setBoardId] = useState(settings.defaultBoardId);
  const [listId, setListId] = useState(settings.defaultListId);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [busy, setBusy] = useState(false);

  const connected = Boolean(settings.appKey && settings.appToken);

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
      await save({
        defaultBoardId: selectedBoard.id,
        defaultBoardName: selectedBoard.name,
        defaultListId: selectedList.id,
        defaultListName: selectedList.name,
      });
      notify({ kind: 'success', text: 'Quadro e lista padrão atualizados.' });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
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
        <EmptyState>
          Nenhum quadro aberto encontrado. Verifique as credenciais e clique em “Atualizar
          quadros”.
        </EmptyState>
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
          <strong>{settings.defaultListName}</strong>. O vínculo com o processo é gravado na
          descrição como <code>SEI &lt;número&gt;</code>.
        </div>
      )}
    </SectionCard>
  );
}
