import { useEffect, useMemo, useState } from 'react';
import type {
  Settings,
  TrelloBoard,
  TrelloCard,
  TrelloLabel,
  TrelloList,
} from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import { Icon } from '../icons';
import { showToast } from '../toast';
import {
  classNames,
  fromDateInputValue,
  labelColorHex,
  TRELLO_LABEL_COLORS,
} from '../utils';
import { Modal } from './Modal';
import { ErrorState, Spinner } from './common';

export interface CreateCardDialogProps {
  processNumber: string;
  processUrl?: string;
  defaultName?: string;
  onClose: () => void;
  onCreated: (card: TrelloCard) => void;
}

export function CreateCardDialog({
  processNumber,
  processUrl,
  defaultName,
  onClose,
  onCreated,
}: CreateCardDialogProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState(defaultName ?? processNumber);
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');

  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [boardId, setBoardId] = useState('');
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [listId, setListId] = useState('');
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingLists, setLoadingLists] = useState(false);

  const [labels, setLabels] = useState<TrelloLabel[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<TrelloLabel[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);
  const [refreshingLabels, setRefreshingLabels] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState<string>('blue');
  const [showLabelCreator, setShowLabelCreator] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    callRpc('settings:get', undefined)
      .then((value) => {
        if (!active) return;
        setSettings(value);
        setBoardId(value.defaultBoardId ?? '');
        setListId(value.defaultListId ?? '');
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoadingBoards(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    let active = true;
    setLoadingBoards(true);
    callRpc('trello:boards', undefined)
      .then((value) => {
        if (!active) return;
        const items = Array.isArray(value) ? value : [];
        setBoards(items);
        setBoardId((previous) => {
          if (previous && items.some((board) => board.id === previous)) return previous;
          const fallback =
            items.find((board) => board.id === settings.defaultBoardId) ?? items[0];
          return fallback?.id ?? '';
        });
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoadingBoards(false);
      });
    return () => {
      active = false;
    };
  }, [settings]);

  useEffect(() => {
    if (!boardId) {
      setLists([]);
      setListId('');
      return;
    }
    let active = true;
    setLoadingLists(true);
    callRpc('trello:lists', { boardId })
      .then((value) => {
        if (!active) return;
        const items = Array.isArray(value) ? value : [];
        setLists(items);
        setListId((previous) => {
          if (previous && items.some((list) => list.id === previous)) return previous;
          const preferred = items.find((list) => list.id === settings?.defaultListId);
          return (preferred ?? items[0])?.id ?? '';
        });
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoadingLists(false);
      });
    return () => {
      active = false;
    };
  }, [boardId, settings]);

  useEffect(() => {
    if (!boardId) {
      setLabels([]);
      return;
    }
    let active = true;
    setLoadingLabels(true);
    callRpc('trello:board-labels', { boardId, fresh: true })
      .then((value) => {
        if (!active) return;
        setLabels(Array.isArray(value) ? value : []);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoadingLabels(false);
      });
    return () => {
      active = false;
    };
  }, [boardId]);

  const configured = Boolean(boardId && listId);
  const selectedIds = useMemo(
    () => new Set(selectedLabels.map((label) => label.id)),
    [selectedLabels],
  );

  const refreshLabels = async () => {
    if (!boardId) return;
    setRefreshingLabels(true);
    try {
      const value = await callRpc('trello:board-labels', { boardId, fresh: true });
      const items = Array.isArray(value) ? value : [];
      setLabels(items);
      setSelectedLabels((previous) =>
        previous.filter((label) => items.some((option) => option.id === label.id)),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRefreshingLabels(false);
    }
  };

  const createLabel = async () => {
    if (!boardId || !newLabelName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await callRpc('trello:create-label', {
        boardId,
        name: newLabelName.trim(),
        color: newLabelColor,
      });
      setLabels((previous) => [...previous, created]);
      setSelectedLabels((previous) => [...previous, created]);
      setNewLabelName('');
      setShowLabelCreator(false);
      showToast('Etiqueta criada.', 'success');
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setError('Informe o nome do cartão.');
      return;
    }
    if (start && due && start > due) {
      setError('A data de início não pode ser posterior ao término.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let card = await callRpc('trello:create-card', {
        name: name.trim(),
        description,
        processNumber,
        processUrl,
        boardId,
        listId,
        start: fromDateInputValue(start),
        due: fromDateInputValue(due),
      });

      for (const label of selectedLabels) {
        card = await callRpc('trello:add-label', { cardId: card.id, labelId: label.id });
      }

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
              disabled={busy}
            >
              {busy ? <Spinner /> : <Icon name="plus" size={14} />}
              Criar cartão
            </button>
          ) : (
            <button
              type="button"
              className="sf-btn sf-btn--primary"
              onClick={() => void openOptionsPage()}
            >
              <Icon name="settings" size={14} />
              Abrir opções
            </button>
          )}
        </>
      }
    >
      {(!settings || loadingBoards) && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner />
          <span className="sf-hint">Carregando quadros…</span>
        </div>
      )}

      {settings && !loadingBoards && !configured && (
        <ErrorState
          message="Escolha um quadro e uma lista nas opções antes de criar cartões."
          extra={
            <button
              type="button"
              className="sf-btn sf-btn--sm"
              onClick={() => void openOptionsPage()}
            >
              Abrir opções
            </button>
          }
        />
      )}

      {error && <ErrorState message={error} />}

      {configured && (
        <div className="sf-create">
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

          <div className="sf-create__grid">
            <div className="sf-field">
              <label htmlFor="sf-create-board">Quadro</label>
              <select
                id="sf-create-board"
                className="sf-select"
                value={boardId}
                onChange={(event) => {
                  setBoardId(event.target.value);
                  setListId('');
                  setSelectedLabels([]);
                }}
                disabled={busy || boards.length === 0}
              >
                {boards.length === 0 && <option value="">Nenhum quadro</option>}
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sf-field">
              <label htmlFor="sf-create-list">Lista</label>
              <select
                id="sf-create-list"
                className="sf-select"
                value={listId}
                onChange={(event) => setListId(event.target.value)}
                disabled={busy || loadingLists || lists.length === 0}
              >
                {lists.length === 0 && <option value="">Nenhuma lista aberta</option>}
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sf-field">
              <label htmlFor="sf-create-start">Início (opcional)</label>
              <input
                id="sf-create-start"
                type="date"
                className="sf-input"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="sf-field">
              <label htmlFor="sf-create-due">Término (opcional)</label>
              <input
                id="sf-create-due"
                type="date"
                className="sf-input"
                value={due}
                onChange={(event) => setDue(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="sf-create__labels">
            <div className="sf-create__labels-head">
              <span className="sf-label">Etiquetas</span>
              <button
                type="button"
                className="sf-btn sf-btn--sm"
                onClick={() => void refreshLabels()}
                disabled={refreshingLabels || busy || !boardId}
              >
                {refreshingLabels ? <Spinner /> : <Icon name="refresh" size={13} />}
                Atualizar etiquetas
              </button>
            </div>

            {loadingLabels ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spinner />
                <span className="sf-hint">Carregando etiquetas…</span>
              </div>
            ) : (
              <div className="sf-create__label-list">
                {labels.length === 0 && (
                  <span className="sf-hint">Este quadro ainda não tem etiquetas.</span>
                )}
                {labels.map((label) => {
                  const active = selectedIds.has(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      className={classNames(
                        'sf-create__label',
                        active && 'sf-create__label--active',
                      )}
                      onClick={() =>
                        setSelectedLabels((previous) =>
                          active
                            ? previous.filter((item) => item.id !== label.id)
                            : [...previous, label],
                        )
                      }
                      disabled={busy}
                      aria-pressed={active}
                    >
                      <span
                        className="sf-label-option__swatch"
                        style={{ backgroundColor: labelColorHex(label.color) }}
                      />
                      <span className="sf-label-option__name">
                        {label.name || `Etiqueta ${label.color ?? 'sem cor'}`}
                      </span>
                      <Icon name={active ? 'check' : 'plus'} size={13} />
                    </button>
                  );
                })}
              </div>
            )}

            {showLabelCreator ? (
              <div className="sf-create__label-form">
                <input
                  className="sf-input"
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  placeholder="Nome da nova etiqueta"
                  disabled={busy}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void createLabel();
                    }
                  }}
                />
                <div className="sf-color-grid">
                  {TRELLO_LABEL_COLORS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={classNames(
                        'sf-color-swatch',
                        option === newLabelColor && 'sf-color-swatch--active',
                      )}
                      style={{ backgroundColor: labelColorHex(option) }}
                      onClick={() => setNewLabelColor(option)}
                      disabled={busy}
                      aria-label={`Cor ${option}`}
                      aria-pressed={option === newLabelColor}
                      title={option}
                    />
                  ))}
                </div>
                <div className="sf-create__label-actions">
                  <button
                    type="button"
                    className="sf-btn sf-btn--sm"
                    onClick={() => {
                      setShowLabelCreator(false);
                      setNewLabelName('');
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="sf-btn sf-btn--primary sf-btn--sm"
                    onClick={() => void createLabel()}
                    disabled={busy || !newLabelName.trim()}
                  >
                    <Icon name="plus" size={13} />
                    Criar e aplicar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="sf-btn sf-btn--sm"
                onClick={() => setShowLabelCreator(true)}
                disabled={busy || !boardId}
              >
                <Icon name="plus" size={13} />
                Nova etiqueta
              </button>
            )}
          </div>

          <div className="sf-hint">
            O vínculo <code>SEI {processNumber}</code> será mantido na última linha da descrição.
          </div>
        </div>
      )}
    </Modal>
  );
}
