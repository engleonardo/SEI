import { useEffect, useRef, useState } from 'react';
import type { CardPatch, TrelloCard } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import type { ProcessCatalog } from '../../core/storage/processes';
import { Icon } from '../../ui/icons';
import { showToast } from '../../ui/toast';
import {
  classNames,
  formatDue,
  labelColorHex,
  labelTextColor,
  locationLabel,
} from '../../ui/utils';
import { InlineLocationPicker } from '../../ui/components/InlineLocationPicker';
import { ChecklistDialog } from '../../ui/components/dialogs/ChecklistDialog';
import { DueDialog } from '../../ui/components/dialogs/DueDialog';
import { LabelsDialog } from '../../ui/components/dialogs/LabelsDialog';
import {
  cardHasUnreadProcess,
  formatActivity,
  processRecordsFor,
  processTypesFor,
} from './model';

export interface DashboardCardProps {
  card: TrelloCard;
  catalog: ProcessCatalog;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onToggleLabel: (labelId: string) => void;
}

type DialogKind = 'due' | 'labels' | 'checklist' | null;

export function DashboardCard({
  card,
  catalog,
  onChanged,
  onRemoved,
  onToggleLabel,
}: DashboardCardProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(card.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(card.description);
  const [busy, setBusy] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editingDesc) return;
    const textarea = descriptionRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
    textarea.style.overflow = 'hidden';
  }, [editingDesc, descDraft]);

  const due = formatDue(card.due, card.dueComplete);
  const unread = cardHasUnreadProcess(card, catalog);
  const types = processTypesFor(card, catalog);
  const activity = formatActivity(card);
  const processes = processRecordsFor(card, catalog);
  const processByNumber = new Map(processes.map((process) => [process.number, process]));

  const update = async (patch: CardPatch) => {
    setBusy(true);
    try {
      const updated = await callRpc('trello:update-card', { cardId: card.id, patch });
      onChanged(updated);
      return true;
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next) {
      showToast('O nome do cartão não pode ficar vazio.', 'error');
      return;
    }
    if (next === card.name) {
      setEditingName(false);
      return;
    }
    if (await update({ name: next })) {
      setEditingName(false);
      showToast('Nome atualizado.', 'success');
    }
  };

  const saveDescription = async () => {
    if (descDraft === card.description) {
      setEditingDesc(false);
      return;
    }
    if (await update({ description: descDraft })) {
      setEditingDesc(false);
      showToast('Descrição atualizada.', 'success');
    }
  };

  const toggleComplete = async () => {
    const next = !card.dueComplete;
    if (await update({ dueComplete: next })) {
      showToast(next ? 'Cartão concluído.' : 'Cartão reaberto.', 'success');
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const updated = await callRpc('trello:card', { cardId: card.id });
      onChanged(updated);
    } catch (cause) {
      if (errorCode(cause) === 'not_found') {
        onRemoved(card.id);
        showToast('O cartão não existe mais no Trello.', 'error');
      } else {
        showToast(errorMessage(cause), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <article
        className={classNames('sdo-card', unread && 'sdo-card--unread', card.dueComplete && 'sdo-card--done')}
      >
        <div className="sdo-card__main">
          <div className="sdo-card__title-row">
            {editingName ? (
              <div className="sdo-inline-edit">
                <input
                  className="sdo-inline-input"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void saveName();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setNameDraft(card.name);
                      setEditingName(false);
                    }
                  }}
                  autoFocus
                  disabled={busy}
                  aria-label="Nome do cartão"
                />
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm sfo-btn--primary"
                  onClick={() => void saveName()}
                  disabled={busy}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onClick={() => {
                    setNameDraft(card.name);
                    setEditingName(false);
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="sdo-card__title-button"
                onClick={() => {
                  setNameDraft(card.name);
                  setEditingName(true);
                }}
                title="Editar nome"
              >
                <h3>{card.name}</h3>
                <Icon name="edit" size={11} />
              </button>
            )}

            {unread && (
              <span className="sdo-badge sdo-badge--danger" title="Processo atualizado no SEI">
                <Icon name="alert" size={11} />
                Atualizado
              </span>
            )}
            {card.hasChecklist && (
              <button
                type="button"
                className="sdo-badge"
                onClick={() => setDialog('checklist')}
                title="Abrir checklist"
              >
                <Icon name="checklist" size={11} />
                Checklist
              </button>
            )}
          </div>

          {card.labels.length > 0 && (
            <div className="sdo-card__labels">
              {card.labels.map((label) => (
                <button
                  type="button"
                  key={label.id}
                  className="sdo-label"
                  style={{
                    backgroundColor: labelColorHex(label.color),
                    color: labelTextColor(label.color),
                  }}
                  onClick={() => onToggleLabel(label.id)}
                  title={`Filtrar por ${label.name || label.color || 'etiqueta'}`}
                >
                  {label.name || label.color || 'Etiqueta'}
                </button>
              ))}
              <button
                type="button"
                className="sdo-label sdo-label--add"
                onClick={() => setDialog('labels')}
                title="Editar etiquetas"
                aria-label="Editar etiquetas"
              >
                <Icon name="tag" size={11} />
              </button>
            </div>
          )}

          {editingDesc ? (
            <div className="sdo-card__desc-edit">
              <textarea
                ref={descriptionRef}
                className="sdo-inline-textarea"
                value={descDraft}
                onChange={(event) => setDescDraft(event.target.value)}
                autoFocus
                disabled={busy}
                aria-label="Descrição do cartão"
              />
              <div className="sdo-inline-edit">
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm sfo-btn--primary"
                  onClick={() => void saveDescription()}
                  disabled={busy}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onClick={() => {
                    setDescDraft(card.description);
                    setEditingDesc(false);
                  }}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : card.description ? (
            <button
              type="button"
              className="sdo-card__desc sdo-card__desc-button"
              onClick={() => {
                setDescDraft(card.description);
                setEditingDesc(true);
              }}
              title="Editar descrição"
            >
              {card.description}
            </button>
          ) : (
            <button
              type="button"
              className="sdo-card__empty-desc"
              onClick={() => {
                setDescDraft('');
                setEditingDesc(true);
              }}
            >
              <Icon name="edit" size={11} />
              Adicionar descrição
            </button>
          )}

          <div className="sdo-card__meta">
            <button
              type="button"
              className="sdo-meta-button"
              onClick={() => setLocationOpen((current) => !current)}
              title="Mover cartão"
            >
              <Icon name="board" size={12} /> {locationLabel(card)}
            </button>

            {card.links.map((processNumber) => {
              const record = processByNumber.get(processNumber);
              const label = (
                <>
                  <Icon name="link" size={11} /> {processNumber}
                </>
              );
              return record?.url ? (
                <a
                  key={processNumber}
                  className="sdo-process"
                  href={record.url}
                  target="_blank"
                  rel="noreferrer"
                  title={record.specification || 'Abrir processo no SEI'}
                >
                  {label}
                  <Icon name="external" size={10} />
                </a>
              ) : (
                <span key={processNumber} className="sdo-process" title="Abra a lista do SEI para registrar o link">
                  {label}
                </span>
              );
            })}

            {types.map((type) => (
              <span key={type} className="sdo-type">
                <Icon name="tag" size={11} /> {type}
              </span>
            ))}

            {activity && (
              <span title={card.lastActivity ? new Date(card.lastActivity).toLocaleString('pt-BR') : ''}>
                <Icon name="clock" size={11} /> Atualizado {activity}
              </span>
            )}
          </div>

          {locationOpen && (
            <InlineLocationPicker
              card={card}
              onClose={() => setLocationOpen(false)}
              onChanged={onChanged}
            />
          )}
        </div>

        <div className="sdo-card__side">
          {due ? (
            <button
              type="button"
              className={classNames(
                'sdo-pill',
                due.tone === 'danger' && 'sdo-pill--danger',
                due.tone === 'warning' && 'sdo-pill--warning',
                due.tone === 'success' && 'sdo-pill--success',
                due.tone === 'neutral' && 'sdo-pill--neutral',
              )}
              onClick={() => setDialog('due')}
              title="Editar prazo"
            >
              <Icon name="calendar" size={11} />
              {due.label}
            </button>
          ) : (
            card.dueComplete && (
              <span className="sdo-pill sdo-pill--success">
                <Icon name="check" size={11} />
                Concluído
              </span>
            )
          )}
          <div className="sdo-card__side-actions">
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => void refresh()}
              disabled={busy}
              title="Atualizar cartão"
              aria-label="Atualizar cartão"
            >
              <Icon name="refresh" size={13} />
            </button>
            <a
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              href={card.shortUrl}
              target="_blank"
              rel="noreferrer"
              title="Abrir no Trello"
            >
              <Icon name="external" size={13} />
              Trello
            </a>
          </div>
        </div>

        <div className="sdo-card__footer">
          <div className="sdo-card__footer-actions">
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('labels')}
              disabled={busy}
            >
              <Icon name="tag" size={13} />
              Etiquetas
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('checklist')}
              disabled={busy}
            >
              <Icon name="checklist" size={13} />
              Checklist
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('due')}
              disabled={busy}
            >
              <Icon name="calendar" size={13} />
              Prazo
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setLocationOpen((current) => !current)}
              disabled={busy}
            >
              <Icon name="board" size={13} />
              Mover
            </button>
            <button
              type="button"
              className={classNames(
                'sfo-btn sfo-btn--sm sfo-btn--ghost',
                !card.dueComplete && 'sdo-card__complete',
              )}
              onClick={() => void toggleComplete()}
              disabled={busy}
            >
              <Icon name={card.dueComplete ? 'refresh' : 'check'} size={13} />
              {card.dueComplete ? 'Reabrir' : 'Concluir'}
            </button>
          </div>
        </div>
      </article>

      {dialog === 'due' && (
        <DueDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'labels' && (
        <LabelsDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'checklist' && (
        <ChecklistDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
    </>
  );
}
