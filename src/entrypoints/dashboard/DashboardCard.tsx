import { useRef, useState, type FocusEvent, type ReactNode } from 'react';
import type { CardPatch, TrelloCard } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import type { ProcessCatalog } from '../../core/storage/processes';
import { Icon } from '../../ui/icons';
import { CardDescription } from '../../ui/components/CardDescription';
import { DescriptionEditor } from '../../ui/components/DescriptionEditor';
import { showToast } from '../../ui/toast';
import { classNames, formatDue, labelColorHex, labelTextColor, locationLabel } from '../../ui/utils';
import { InlineLocationPicker } from '../../ui/components/InlineLocationPicker';
import { ChecklistDialog } from '../../ui/components/dialogs/ChecklistDialog';
import { CommentsDialog } from '../../ui/components/dialogs/CommentsDialog';
import { AttachmentsDialog } from '../../ui/components/dialogs/AttachmentsDialog';
import { ShareDialog } from '../../ui/components/dialogs/ShareDialog';
import { DeleteCardDialog } from '../../ui/components/dialogs/DeleteCardDialog';
import { DueDialog } from '../../ui/components/dialogs/DueDialog';
import { LabelsDialog } from '../../ui/components/dialogs/LabelsDialog';
import { LinkProcessDialog } from '../../ui/components/dialogs/LinkProcessDialog';
import { cardHasUnreadProcess, formatActivity, processRecordsFor, processTypesFor } from './model';

export interface DashboardCardProps {
  card: TrelloCard;
  catalog: ProcessCatalog;
  pinned?: boolean;
  dense?: boolean;
  dragHandle?: ReactNode;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onToggleLabel: (labelId: string) => void;
  onProcessesRead: (numbers: string[]) => void;
  onTogglePin?: (cardId: string) => void;
}

type DialogKind = 'due' | 'labels' | 'checklist' | 'attachments' | 'share' | 'comments' | null;

export function DashboardCard({
  card,
  catalog,
  pinned = false,
  dense = false,
  dragHandle,
  onChanged,
  onRemoved,
  onToggleLabel,
  onProcessesRead,
  onTogglePin,
}: DashboardCardProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(card.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(card.description);
  const descDraftRef = useRef(card.description);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [linkProcessOpen, setLinkProcessOpen] = useState(false);

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
    const next = descDraftRef.current;
    if (next === card.description) {
      setEditingDesc(false);
      return;
    }
    if (await update({ description: next })) {
      setEditingDesc(false);
      showToast('Descrição atualizada.', 'success');
    }
  };

  const handleNameBlur = () => {
    if (!nameDraft.trim()) {
      setNameDraft(card.name);
      setEditingName(false);
      return;
    }
    void saveName();
  };

  const handleDescriptionBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    void saveDescription();
  };

  const markProcessesRead = async (numbers: string[]) => {
    const unique = Array.from(new Set(numbers.filter(Boolean)));
    if (unique.length === 0) return;
    try {
      await callRpc('processes:upsert', {
        processes: unique.map((number) => ({ number, acknowledged: true })),
      });
      onProcessesRead(unique);
    } catch {
      // O próximo scan da lista do SEI corrige o estado.
    }
  };

  const toggleComplete = async () => {
    const next = !card.dueComplete;
    // Ao concluir, grava o momento do clique no prazo do cartão.
    const patch = next
      ? { dueComplete: true, due: new Date().toISOString() }
      : { dueComplete: false, due: null };
    if (await update(patch)) {
      if (next) void markProcessesRead(card.links);
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
        className={classNames(
          'sdo-card',
          dense && 'sdo-card--kanban',
          unread && 'sdo-card--unread',
          card.dueComplete && 'sdo-card--done',
        )}
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
                  onBlur={handleNameBlur}
                  autoFocus
                  disabled={busy}
                  aria-label="Nome do cartão"
                />
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm sfo-btn--primary"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void saveName()}
                  disabled={busy}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onMouseDown={(event) => event.preventDefault()}
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
              <button
                type="button"
                className="sdo-badge sdo-badge--danger"
                title="Marcar processo como lido"
                aria-label="Marcar processo como lido"
                onClick={() => void markProcessesRead(card.links)}
              >
                <Icon name="alert" size={11} />
                Atualizado
              </button>
            )}
          </div>

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

          {editingDesc ? (
            <div className="sdo-card__desc-edit" onBlur={handleDescriptionBlur}>
              <DescriptionEditor
                value={descDraft}
                onChange={(value) => {
                  setDescDraft(value);
                  descDraftRef.current = value;
                }}
                disabled={busy}
                autoFocus
                placeholder="Escreva a descrição…"
                ariaLabel="Descrição do cartão"
              />
              <div className="sdo-inline-edit">
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm sfo-btn--primary"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void saveDescription()}
                  disabled={busy}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="sfo-btn sfo-btn--sm"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    descDraftRef.current = card.description;
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
            <div
              className="sdo-card__desc sdo-card__desc-view"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) return;
                descDraftRef.current = card.description;
                setDescDraft(card.description);
                setEditingDesc(true);
              }}
              onKeyDown={(event) => {
                if ((event.target as HTMLElement).closest('a')) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                descDraftRef.current = card.description;
                setDescDraft(card.description);
                setEditingDesc(true);
              }}
              title="Editar descrição"
            >
              <CardDescription text={card.description} compact={!descExpanded} />
            </div>
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

          {card.hasChecklist && (
            <button
              type="button"
              className="sdo-card__checklist"
              onClick={() => setDialog('checklist')}
              title="Abrir checklist"
            >
              <Icon name="checklist" size={11} />
              Checklist
              {card.checklistItems
                ? ` · ${card.checklistChecked ?? 0}/${card.checklistItems}`
                : ''}
            </button>
          )}

          {card.description &&
            (descExpanded || card.description.length > 90 || card.description.includes('\n')) && (
              <div className="sdo-card__expand-row">
                <button
                  type="button"
                  className={classNames(
                    'sdo-card__expand',
                    descExpanded && 'sdo-card__expand--on',
                  )}
                  onClick={() => setDescExpanded((current) => !current)}
                  aria-expanded={descExpanded}
                  aria-label={descExpanded ? 'Recolher descrição' : 'Expandir descrição'}
                  title={descExpanded ? 'Recolher descrição' : 'Expandir descrição'}
                >
                  <Icon name="more" size={13} />
                </button>
              </div>
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

            {card.links.length === 0 && (
              <button
                type="button"
                className="sdo-link-missing"
                onClick={() => setLinkProcessOpen(true)}
                title="Vincular a um processo do SEI"
              >
                <Icon name="link" size={11} />
                Sem vínculo
              </button>
            )}

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
                  onClick={() => void markProcessesRead([processNumber])}
                >
                  {label}
                  <Icon name="external" size={10} />
                </a>
              ) : (
                <span
                  key={processNumber}
                  className="sdo-process"
                  title="Abra a lista do SEI para registrar o link"
                >
                  {label}
                </span>
              );
            })}

            {onTogglePin && (
              <button
                type="button"
                className={classNames(
                  'sfo-icon-btn',
                  'sdo-card__pin-inline',
                  pinned && 'sfo-icon-btn--pinned',
                )}
                onClick={() => onTogglePin(card.id)}
                aria-pressed={pinned}
                aria-label={pinned ? 'Desafixar cartão' : 'Fixar cartão no topo'}
                title={pinned ? 'Desafixar cartão' : 'Fixar cartão no topo'}
              >
                <Icon name="pin" size={13} />
              </button>
            )}

            {activity && (
              <span
                className="sdo-card__activity"
                title={`Atualizado em ${new Date(card.lastActivity!).toLocaleString('pt-BR')}`}
                aria-label={`Atualizado em ${new Date(card.lastActivity!).toLocaleString('pt-BR')}`}
              >
                <Icon name="clock" size={11} /> {activity}
              </span>
            )}

            {types.map((type) => (
              <span key={type} className="sdo-type">
                <Icon name="tag" size={11} /> {type}
              </span>
            ))}
          </div>

          {locationOpen && (
            <InlineLocationPicker card={card} onClose={() => setLocationOpen(false)} onChanged={onChanged} />
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
          ) : card.dueComplete ? (
            <span className="sdo-pill sdo-pill--success">
              <Icon name="check" size={11} />
              Concluído
            </span>
          ) : (
            <button
              type="button"
              className="sdo-pill sdo-pill--neutral"
              onClick={() => setDialog('due')}
              title="Definir prazo"
            >
              <Icon name="calendar" size={11} />
              Sem prazo
            </button>
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
              aria-label="Abrir no Trello"
            >
              <Icon name="external" size={13} />
              <span className="sdo-card__action-label">Trello</span>
            </a>
          </div>
        </div>

        <div className="sdo-card__footer">
          <div className="sdo-card__footer-actions">
            {dragHandle}
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setLocationOpen((current) => !current)}
              disabled={busy}
              title="Mover"
              aria-label="Mover"
            >
              <Icon name="board" size={13} />
              <span className="sdo-card__action-label">Mover</span>
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('share')}
              disabled={busy}
              title="Compartilhar e clonar"
              aria-label="Compartilhar e clonar"
            >
              <Icon name="copy" size={13} />
              <span className="sdo-card__action-label">Clonar</span>
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('labels')}
              disabled={busy}
              title="Etiquetas"
              aria-label="Etiquetas"
            >
              <Icon name="tag" size={13} />
              <span className="sdo-card__action-label">Etiquetas</span>
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('checklist')}
              disabled={busy}
              title="Checklist"
              aria-label="Checklist"
            >
              <Icon name="checklist" size={13} />
              <span className="sdo-card__action-label">Checklist</span>
            </button>
            <button
              type="button"
              className={classNames(
                'sfo-btn sfo-btn--sm sfo-btn--ghost',
                Boolean(card.commentCount) && 'sdo-card__attachment--on',
              )}
              onClick={() => setDialog('comments')}
              disabled={busy}
              title={card.commentCount ? `Comentários (${card.commentCount})` : 'Comentários'}
              aria-label="Comentários"
            >
              <Icon name="comment" size={13} />
              <span className="sdo-card__action-label">
                Comentários{card.commentCount ? ` (${card.commentCount})` : ''}
              </span>
            </button>
            <button
              type="button"
              className={classNames(
                'sfo-btn sfo-btn--sm sfo-btn--ghost',
                Boolean(card.attachmentCount) && 'sdo-card__attachment--on',
              )}
              onClick={() => setDialog('attachments')}
              disabled={busy}
              title={card.attachmentCount ? `Anexos (${card.attachmentCount})` : 'Anexos'}
              aria-label="Anexos"
            >
              <Icon name="paperclip" size={13} />
              <span className="sdo-card__action-label">Anexos</span>
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--ghost"
              onClick={() => setDialog('due')}
              disabled={busy}
              title="Prazo"
              aria-label="Prazo"
            >
              <Icon name="calendar" size={13} />
              <span className="sdo-card__action-label">Prazo</span>
            </button>
            <button
              type="button"
              className={classNames(
                'sfo-btn sfo-btn--sm sfo-btn--ghost',
                !card.dueComplete && 'sdo-card__complete',
              )}
              onClick={() => void toggleComplete()}
              disabled={busy}
              title={card.dueComplete ? 'Reabrir' : 'Concluir'}
              aria-label={card.dueComplete ? 'Reabrir' : 'Concluir'}
            >
              <Icon name={card.dueComplete ? 'refresh' : 'check'} size={13} />
              <span className="sdo-card__action-label">{card.dueComplete ? 'Reabrir' : 'Concluir'}</span>
            </button>
          </div>
          <div className="sdo-card__footer-danger">
            <button
              type="button"
              className="sfo-icon-btn sfo-icon-btn--danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              title="Excluir cartão"
              aria-label="Excluir cartão"
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      </article>

      {dialog === 'due' && <DueDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />}
      {dialog === 'labels' && (
        <LabelsDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'checklist' && (
        <ChecklistDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'attachments' && <AttachmentsDialog card={card} onClose={() => setDialog(null)} />}
      {dialog === 'comments' && (
        <CommentsDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'share' && <ShareDialog card={card} onClose={() => setDialog(null)} />}
      {confirmDelete && (
        <DeleteCardDialog
          card={card}
          onClose={() => setConfirmDelete(false)}
          onDeleted={(ids) => {
            for (const id of ids) onRemoved(id);
          }}
        />
      )}

      {linkProcessOpen && (
        <LinkProcessDialog
          card={card}
          catalog={catalog}
          onClose={() => setLinkProcessOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
