import { useEffect, useState } from 'react';
import type { TrelloCard, TrelloChecklist } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../icons';
import { showToast } from '../../toast';
import { ErrorState, Spinner } from '../common';
import { ConfirmDialog, Modal } from '../Modal';

export function ChecklistDialog({
  card,
  onClose,
  onChanged,
}: {
  card: TrelloCard;
  onClose: () => void;
  onChanged: (card: TrelloCard) => void;
}) {
  const [checklists, setChecklists] = useState<TrelloChecklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newChecklist, setNewChecklist] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<TrelloChecklist | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    callRpc('trello:checklists', { cardId: card.id, fresh: true })
      .then((value) => {
        if (active) setChecklists(value);
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
  }, [card.id]);

  const refreshCard = async () => {
    try {
      const updated = await callRpc('trello:card', { cardId: card.id });
      onChanged(updated);
    } catch {
      // o painel continua funcional mesmo se o cartão não puder ser atualizado
    }
  };

  const addChecklist = async () => {
    if (!newChecklist.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const value = await callRpc('trello:create-checklist', {
        cardId: card.id,
        name: newChecklist.trim(),
      });
      setChecklists(value);
      setNewChecklist('');
      await refreshCard();
      showToast('Checklist criada.', 'success');
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (checklistId: string) => {
    const name = (drafts[checklistId] ?? '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const item = await callRpc('trello:add-check-item', { checklistId, name });
      setChecklists((previous) =>
        previous.map((checklist) =>
          checklist.id === checklistId
            ? { ...checklist, checkItems: [...checklist.checkItems, item] }
            : checklist,
        ),
      );
      setDrafts((previous) => ({ ...previous, [checklistId]: '' }));
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (
    checklistId: string,
    itemId: string,
    current: 'complete' | 'incomplete',
  ) => {
    const next = current === 'complete' ? 'incomplete' : 'complete';
    setChecklists((previous) =>
      previous.map((checklist) =>
        checklist.id === checklistId
          ? {
              ...checklist,
              checkItems: checklist.checkItems.map((item) =>
                item.id === itemId ? { ...item, state: next } : item,
              ),
            }
          : checklist,
      ),
    );
    try {
      await callRpc('trello:update-check-item', {
        cardId: card.id,
        checkItemId: itemId,
        state: next,
      });
    } catch (cause) {
      setChecklists((previous) =>
        previous.map((checklist) =>
          checklist.id === checklistId
            ? {
                ...checklist,
                checkItems: checklist.checkItems.map((item) =>
                  item.id === itemId ? { ...item, state: current } : item,
                ),
              }
            : checklist,
        ),
      );
      showToast(errorMessage(cause), 'error');
    }
  };

  const deleteItem = async (checklistId: string, itemId: string) => {
    setChecklists((previous) =>
      previous.map((checklist) =>
        checklist.id === checklistId
          ? { ...checklist, checkItems: checklist.checkItems.filter((item) => item.id !== itemId) }
          : checklist,
      ),
    );
    try {
      await callRpc('trello:delete-check-item', { checklistId, checkItemId: itemId });
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
      setChecklists(await callRpc('trello:checklists', { cardId: card.id, fresh: true }));
    }
  };

  const deleteChecklist = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await callRpc('trello:delete-checklist', { checklistId: deleteTarget.id });
      setChecklists((previous) => previous.filter((checklist) => checklist.id !== deleteTarget.id));
      setDeleteTarget(null);
      await refreshCard();
      showToast('Checklist removida.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        title="Checklist"
        subtitle={card.name}
        onClose={onClose}
        footer={
          <button type="button" className="sf-btn" onClick={onClose}>
            Concluir
          </button>
        }
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span className="sf-hint">Carregando checklist…</span>
          </div>
        ) : (
          <div className="sf-checklist">
            {error && <ErrorState message={error} />}
            {checklists.length === 0 && <span className="sf-hint">Nenhuma checklist ainda.</span>}

            {checklists.map((checklist) => {
              const total = checklist.checkItems.length;
              const done = checklist.checkItems.filter((item) => item.state === 'complete').length;
              const percent = total === 0 ? 0 : Math.round((done / total) * 100);
              return (
                <div key={checklist.id} className="sf-checklist__box">
                  <div className="sf-checklist__head">
                    <h3 className="sf-checklist__name">{checklist.name}</h3>
                    <span className="sf-chip">
                      {done}/{total}
                    </span>
                    <button
                      type="button"
                      className="sf-icon-btn sf-icon-btn--danger"
                      onClick={() => setDeleteTarget(checklist)}
                      aria-label={`Remover checklist ${checklist.name}`}
                      title="Remover checklist"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <div className="sf-checklist__progress" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="sf-checklist__items">
                    {checklist.checkItems.map((item) => (
                      <div key={item.id} className="sf-checklist__item">
                        <input
                          type="checkbox"
                          checked={item.state === 'complete'}
                          onChange={() => void toggleItem(checklist.id, item.id, item.state)}
                          aria-label={item.name}
                          style={{ accentColor: 'var(--sf-accent)' }}
                        />
                        <span
                          className={
                            item.state === 'complete'
                              ? 'sf-checklist__item-name sf-checklist__item-name--done'
                              : 'sf-checklist__item-name'
                          }
                        >
                          {item.name}
                        </span>
                        <button
                          type="button"
                          className="sf-icon-btn"
                          style={{ width: 24, height: 24 }}
                          onClick={() => void deleteItem(checklist.id, item.id)}
                          aria-label={`Remover item ${item.name}`}
                          title="Remover item"
                        >
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="sf-checklist__add">
                    <input
                      className="sf-input"
                      value={drafts[checklist.id] ?? ''}
                      onChange={(event) =>
                        setDrafts((previous) => ({ ...previous, [checklist.id]: event.target.value }))
                      }
                      placeholder="Adicionar item…"
                      disabled={busy}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addItem(checklist.id);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="sf-btn sf-btn--sm"
                      onClick={() => void addItem(checklist.id)}
                      disabled={busy || !(drafts[checklist.id] ?? '').trim()}
                    >
                      <Icon name="plus" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="sf-field" style={{ borderTop: '1px solid var(--sf-border)', paddingTop: 12 }}>
              <span className="sf-label">Nova checklist</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="sf-input"
                  value={newChecklist}
                  onChange={(event) => setNewChecklist(event.target.value)}
                  placeholder="Nome da checklist"
                  disabled={busy}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addChecklist();
                    }
                  }}
                />
                <button
                  type="button"
                  className="sf-btn sf-btn--primary"
                  onClick={() => void addChecklist()}
                  disabled={busy || !newChecklist.trim()}
                >
                  <Icon name="plus" size={14} />
                  Criar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {deleteTarget && (
        <ConfirmDialog
          title="Remover checklist"
          message={`A checklist “${deleteTarget.name}” e seus itens serão removidos do cartão no Trello.`}
          confirmLabel="Remover"
          tone="danger"
          busy={busy}
          onConfirm={() => void deleteChecklist()}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
