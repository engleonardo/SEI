import { useEffect, useState } from 'react';
import type { TrelloCard, TrelloChecklist } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import type { ChecklistTemplate } from '../../../core/storage/checklist-templates';
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
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [saveSource, setSaveSource] = useState<{ name: string; items: string[] } | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItems, setNewTemplateItems] = useState('');
  const [deleteTemplate, setDeleteTemplate] = useState<ChecklistTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ChecklistTemplate | null>(null);
  const [editingItem, setEditingItem] = useState<{
    checklistId: string;
    itemId: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    callRpc('checklists:templates', undefined)
      .then((value) => {
        if (active) setTemplates(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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

  const moveItem = async (checklist: TrelloChecklist, index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= checklist.checkItems.length) return;
    const items = checklist.checkItems;
    const current = items[index];
    const target = items[targetIndex];
    if (!current || !target) return;

    const positionOf = (item: { pos?: number }, position: number) =>
      typeof item.pos === 'number' ? item.pos : position + 1;
    const targetPos = positionOf(target, targetIndex);
    const neighborIndex = index + direction * 2;
    const neighbor = items[neighborIndex];
    const newPos = neighbor
      ? (targetPos + positionOf(neighbor, neighborIndex)) / 2
      : targetPos + (direction === -1 ? -0.5 : 0.5);

    const reordered = [...items];
    reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, { ...current, pos: newPos });
    setChecklists((previous) =>
      previous.map((item) =>
        item.id === checklist.id ? { ...item, checkItems: reordered } : item,
      ),
    );

    setBusy(true);
    try {
      await callRpc('trello:update-check-item', {
        cardId: card.id,
        checkItemId: current.id,
        pos: newPos,
      });
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
      setChecklists(await callRpc('trello:checklists', { cardId: card.id, fresh: true }));
    } finally {
      setBusy(false);
    }
  };

  const saveItemName = async () => {
    if (!editingItem || busy) return;
    const name = editingItem.name.trim();
    if (!name) {
      setEditingItem(null);
      return;
    }
    const checklist = checklists.find((item) => item.id === editingItem.checklistId);
    const item = checklist?.checkItems.find((entry) => entry.id === editingItem.itemId);
    if (!item || item.name === name) {
      setEditingItem(null);
      return;
    }
    setBusy(true);
    try {
      await callRpc('trello:update-check-item', {
        cardId: card.id,
        checkItemId: item.id,
        name,
      });
      setChecklists((previous) =>
        previous.map((entry) =>
          entry.id === editingItem.checklistId
            ? {
                ...entry,
                checkItems: entry.checkItems.map((checkItem) =>
                  checkItem.id === item.id ? { ...checkItem, name } : checkItem,
                ),
              }
            : entry,
        ),
      );
      setEditingItem(null);
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
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

  const applyTemplate = async (template: ChecklistTemplate) => {
    setBusy(true);
    setError(null);
    try {
      const value = await callRpc('trello:apply-checklist-template', {
        cardId: card.id,
        name: template.name,
        items: template.items,
      });
      setChecklists(value);
      await refreshCard();
      showToast(`Modelo “${template.name}” aplicado.`, 'success');
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openSaveTemplate = (checklist: TrelloChecklist) => {
    const items = checklist.checkItems.map((item) => item.name).filter(Boolean);
    if (items.length === 0) {
      showToast('Adicione pelo menos um item antes de salvar o modelo.', 'error');
      return;
    }
    setSaveSource({ name: checklist.name, items });
    setTemplateName(checklist.name);
    setCreatingTemplate(false);
    setEditingTemplate(null);
  };

  const openNewTemplate = () => {
    const next = !creatingTemplate;
    setCreatingTemplate(next);
    setEditingTemplate(null);
    setSaveSource(null);
    if (next) {
      setNewTemplateName('');
      setNewTemplateItems('');
    }
  };

  const openEditTemplate = (template: ChecklistTemplate) => {
    setEditingTemplate(template);
    setCreatingTemplate(false);
    setSaveSource(null);
    setNewTemplateName(template.name);
    setNewTemplateItems(template.items.join('\n'));
  };

  const closeTemplateForm = () => {
    setCreatingTemplate(false);
    setEditingTemplate(null);
    setNewTemplateName('');
    setNewTemplateItems('');
  };

  const saveTemplate = async () => {
    const name = templateName.trim();
    if (!saveSource || !name) return;
    setBusy(true);
    try {
      const existing = templates.find(
        (template) => template.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
      );
      const value = await callRpc('checklists:template-save', {
        id: existing?.id,
        name,
        items: saveSource.items,
      });
      setTemplates(value);
      setSaveSource(null);
      setTemplateName('');
      showToast('Modelo de checklist salvo.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveNewTemplate = async () => {
    const name = newTemplateName.trim();
    const items = newTemplateItems
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (!name || items.length === 0) {
      showToast('Informe o nome e pelo menos um item por linha.', 'error');
      return;
    }
    const editingId = editingTemplate?.id;
    setBusy(true);
    try {
      const existing = editingId
        ? undefined
        : templates.find(
            (template) =>
              template.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
          );
      const value = await callRpc('checklists:template-save', {
        id: editingId ?? existing?.id,
        name,
        items,
      });
      setTemplates(value);
      closeTemplateForm();
      showToast(editingId ? 'Modelo atualizado.' : 'Modelo de checklist salvo.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async () => {
    if (!deleteTemplate) return;
    setBusy(true);
    try {
      const value = await callRpc('checklists:template-delete', { id: deleteTemplate.id });
      setTemplates(value);
      if (editingTemplate?.id === deleteTemplate.id) closeTemplateForm();
      setDeleteTemplate(null);
      showToast('Modelo removido.', 'success');
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

            <div className="sf-checklist__box sf-checklist__templates">
              <div className="sf-checklist__head">
                <h3 className="sf-checklist__name">Modelos salvos</h3>
                <button
                  type="button"
                  className="sf-btn sf-btn--sm"
                  onClick={openNewTemplate}
                  disabled={busy}
                  aria-expanded={creatingTemplate}
                >
                  <Icon name={creatingTemplate ? 'close' : 'plus'} size={13} />
                  {creatingTemplate ? 'Fechar' : 'Novo modelo'}
                </button>
              </div>
              {templates.length === 0 ? (
                <span className="sf-hint">
                  Salve uma checklist como modelo para reutilizar em outros cartões.
                </span>
              ) : (
                <div className="sf-checklist__template-list">
                  {templates.map((template) => {
                    const applied = checklists.some(
                      (checklist) =>
                        checklist.name.trim().toLocaleLowerCase('pt-BR') ===
                        template.name.trim().toLocaleLowerCase('pt-BR'),
                    );
                    return (
                      <div key={template.id} className="sf-checklist__template">
                        <span className="sf-checklist__template-name">{template.name}</span>
                        <span className="sf-chip">
                          {template.items.length} {template.items.length === 1 ? 'item' : 'itens'}
                        </span>
                        <button
                          type="button"
                          className="sf-btn sf-btn--sm"
                          onClick={() => void applyTemplate(template)}
                          disabled={busy || applied}
                          title={
                            applied
                              ? 'O cartão já tem uma checklist com este nome'
                              : 'Aplicar este modelo ao cartão'
                          }
                        >
                          {applied ? 'Aplicado' : 'Aplicar'}
                        </button>
                        <button
                          type="button"
                          className="sf-icon-btn"
                          onClick={() => openEditTemplate(template)}
                          disabled={busy}
                          aria-label={`Editar modelo ${template.name}`}
                          title="Editar modelo"
                        >
                          <Icon name="edit" size={13} />
                        </button>
                        <button
                          type="button"
                          className="sf-icon-btn sf-icon-btn--danger"
                          onClick={() => setDeleteTemplate(template)}
                          disabled={busy}
                          aria-label={`Remover modelo ${template.name}`}
                          title="Remover modelo"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {(creatingTemplate || editingTemplate) && (
                <div className="sf-field" style={{ marginTop: 10 }}>
                  <span className="sf-label">
                    {editingTemplate ? `Editar modelo “${editingTemplate.name}”` : 'Novo modelo'}
                  </span>
                  <input
                    className="sf-input"
                    value={newTemplateName}
                    onChange={(event) => setNewTemplateName(event.target.value)}
                    placeholder="Nome do modelo"
                    disabled={busy}
                  />
                  <textarea
                    className="sf-input"
                    value={newTemplateItems}
                    onChange={(event) => setNewTemplateItems(event.target.value)}
                    placeholder={'Um item por linha…\nConferir documento\nRegistrar andamento'}
                    rows={4}
                    disabled={busy}
                    aria-label="Itens do modelo, um por linha"
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="sf-btn sf-btn--sm sf-btn--primary"
                      onClick={() => void saveNewTemplate()}
                      disabled={busy || !newTemplateName.trim() || !newTemplateItems.trim()}
                    >
                      {editingTemplate ? 'Salvar alterações' : 'Salvar modelo'}
                    </button>
                    <button
                      type="button"
                      className="sf-btn sf-btn--sm"
                      onClick={closeTemplateForm}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {saveSource && (
                <div className="sf-field" style={{ marginTop: 10 }}>
                  <span className="sf-label">Salvar “{saveSource.name}” como modelo</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="sf-input"
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      placeholder="Nome do modelo"
                      disabled={busy}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void saveTemplate();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="sf-btn sf-btn--sm sf-btn--primary"
                      onClick={() => void saveTemplate()}
                      disabled={busy || !templateName.trim()}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="sf-btn sf-btn--sm"
                      onClick={() => setSaveSource(null)}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

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
                      className="sf-icon-btn"
                      onClick={() => openSaveTemplate(checklist)}
                      aria-label={`Salvar checklist ${checklist.name} como modelo`}
                      title="Salvar como modelo"
                    >
                      <Icon name="download" size={13} />
                    </button>
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
                    {checklist.checkItems.map((item, index) => (
                      <div key={item.id} className="sf-checklist__item">
                        <input
                          type="checkbox"
                          checked={item.state === 'complete'}
                          onChange={() => void toggleItem(checklist.id, item.id, item.state)}
                          aria-label={item.name}
                          style={{ accentColor: 'var(--sf-accent)' }}
                        />
                        {editingItem?.itemId === item.id ? (
                          <input
                            className="sf-input sf-checklist__item-input"
                            value={editingItem.name}
                            onChange={(event) =>
                              setEditingItem({ ...editingItem, name: event.target.value })
                            }
                            onBlur={() => void saveItemName()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void saveItemName();
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setEditingItem(null);
                              }
                            }}
                            aria-label={`Editar item ${item.name}`}
                            disabled={busy}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={
                              item.state === 'complete'
                                ? 'sf-checklist__item-name sf-checklist__item-name--done'
                                : 'sf-checklist__item-name'
                            }
                          >
                            {item.name}
                          </span>
                        )}
                        <div className="sf-checklist__item-actions">
                          <button
                            type="button"
                            className="sf-icon-btn"
                            onClick={() => void moveItem(checklist, index, -1)}
                            disabled={busy || index === 0}
                            aria-label={`Mover ${item.name} para cima`}
                            title="Mover para cima"
                          >
                            <Icon name="chevronUp" size={12} />
                          </button>
                          <button
                            type="button"
                            className="sf-icon-btn"
                            onClick={() => void moveItem(checklist, index, 1)}
                            disabled={busy || index === checklist.checkItems.length - 1}
                            aria-label={`Mover ${item.name} para baixo`}
                            title="Mover para baixo"
                          >
                            <Icon name="chevronDown" size={12} />
                          </button>
                          <button
                            type="button"
                            className="sf-icon-btn"
                            onClick={() =>
                              setEditingItem({
                                checklistId: checklist.id,
                                itemId: item.id,
                                name: item.name,
                              })
                            }
                            disabled={busy}
                            aria-label={`Editar item ${item.name}`}
                            title="Editar texto"
                          >
                            <Icon name="edit" size={12} />
                          </button>
                          <button
                            type="button"
                            className="sf-icon-btn"
                            onClick={() => void deleteItem(checklist.id, item.id)}
                            disabled={busy}
                            aria-label={`Remover item ${item.name}`}
                            title="Remover item"
                          >
                            <Icon name="close" size={12} />
                          </button>
                        </div>
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

      {deleteTemplate && (
        <ConfirmDialog
          title="Remover modelo"
          message={`O modelo “${deleteTemplate.name}” será removido deste navegador. As checklists já aplicadas não mudam.`}
          confirmLabel="Remover"
          tone="danger"
          busy={busy}
          onConfirm={() => void removeTemplate()}
          onClose={() => setDeleteTemplate(null)}
        />
      )}
    </>
  );
}
