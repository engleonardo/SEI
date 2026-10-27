import { useEffect, useRef, useState } from 'react';
import type { CardPatch, TrelloCard } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { showToast } from '../toast';
import { classNames, formatDue, isOverdue, labelColorHex, labelTextColor, locationLabel } from '../utils';
import { ConfirmDialog } from './Modal';
import { InlineLocationPicker } from './InlineLocationPicker';
import { ChecklistDialog } from './dialogs/ChecklistDialog';
import { DueDialog } from './dialogs/DueDialog';
import { LabelsDialog } from './dialogs/LabelsDialog';

export interface CardItemProps {
  card: TrelloCard;
  processNumber: string;
  showProcessMeta?: boolean;
  showLocation?: boolean;
  compact?: boolean;
  highlight?: boolean;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
}

type DialogKind = 'due' | 'labels' | 'checklist' | null;

export function CardItem({
  card,
  processNumber,
  showProcessMeta = true,
  showLocation = true,
  compact = false,
  highlight = false,
  onChanged,
  onRemoved,
}: CardItemProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(card.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(card.description);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
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
  const overdue = isOverdue(card);

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

  const toggleComplete = async () => {
    const next = !card.dueComplete;
    if (await update({ dueComplete: next })) {
      showToast(next ? 'Cartão concluído.' : 'Cartão reaberto.', 'success');
    }
  };

  const unlink = async () => {
    if (!processNumber) return;
    setBusy(true);
    try {
      const updated = await callRpc('trello:unlink-card', {
        cardId: card.id,
        processNumber,
      });
      setConfirmUnlink(false);
      if (updated.links.includes(processNumber)) onChanged(updated);
      else onRemoved(card.id);
      showToast('Cartão desvinculado deste processo.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await callRpc('trello:delete-card', { cardId: card.id });
      setConfirmDelete(false);
      onRemoved(card.id);
      showToast('Cartão removido do Trello.', 'success');
    } catch (cause) {
      showToast(errorMessage(cause), 'error');
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = (label: string) => (compact ? undefined : label);

  return (
    <>
      <div
        className={classNames(
          'sf-card',
          compact && 'sf-card--compact',
          overdue && 'sf-card--overdue',
          card.dueComplete && 'sf-card--done',
          highlight && 'sf-card--highlight',
        )}
      >
        {busy && (
          <div className="sf-card__loading" aria-live="polite">
            <span className="sf-spinner" />
          </div>
        )}

        <div className="sf-card__body">
          <div className="sf-card__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="sf-input"
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="sf-btn sf-btn--primary sf-btn--sm"
                    onClick={() => void saveName()}
                    disabled={busy}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="sf-btn sf-btn--sm"
                    onClick={() => {
                      setNameDraft(card.name);
                      setEditingName(false);
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="sf-card__title-row">
                <button
                  type="button"
                  className="sf-card__title-button"
                  onClick={() => {
                    setNameDraft(card.name);
                    setEditingName(true);
                  }}
                  title="Editar nome"
                  aria-label="Editar nome"
                >
                  <h3 className="sf-card__title">{card.name}</h3>
                </button>
                {highlight && <span className="sf-card__status">Atualizado</span>}
              </div>
            )}
          </div>

          <div className="sf-card__actions">
            <button
              type="button"
              className="sf-icon-btn"
              onClick={() => void refresh()}
              disabled={busy}
              aria-label="Atualizar cartão"
              title="Atualizar cartão"
            >
              <Icon name="refresh" size={15} />
            </button>
            <a
              className="sf-icon-btn"
              href={card.shortUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir no Trello"
              title="Abrir no Trello"
            >
              <Icon name="external" size={15} />
            </a>
          </div>
        </div>

        <div className="sf-card__labels">
          {card.labels.map((label) => (
            <span
              key={label.id}
              className="sf-label-chip"
              style={{
                backgroundColor: labelColorHex(label.color),
                color: labelTextColor(label.color),
              }}
              title={label.name || label.color || 'Etiqueta'}
            >
              {label.name || label.color || 'Etiqueta'}
            </span>
          ))}
          <button
            type="button"
            className="sf-label-chip sf-label-chip--add"
            onClick={() => setDialog('labels')}
            aria-label="Editar etiquetas"
            title="Editar etiquetas"
          >
            <Icon name="tag" size={11} />
          </button>
        </div>

        {editingDesc ? (
          <div style={{ marginTop: 8 }}>
            <textarea
              ref={descriptionRef}
              className="sf-textarea"
              value={descDraft}
              onChange={(event) => setDescDraft(event.target.value)}
              autoFocus
              disabled={busy}
              aria-label="Descrição do cartão"
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                type="button"
                className="sf-btn sf-btn--primary sf-btn--sm"
                onClick={() => void saveDescription()}
                disabled={busy}
              >
                Salvar
              </button>
              <button
                type="button"
                className="sf-btn sf-btn--sm"
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
            className="sf-card__desc sf-card__desc-button"
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
            className="sf-card__empty-desc"
            onClick={() => {
              setDescDraft('');
              setEditingDesc(true);
            }}
          >
            <Icon name="edit" size={12} />
            Adicionar descrição
          </button>
        )}

        <div className="sf-card__meta">
          {card.dueComplete && !card.due && (
            <span className="sf-chip sf-chip--success">Concluído</span>
          )}
          {due && (
            <button
              type="button"
              className={classNames('sf-chip', due.tone !== 'neutral' && `sf-chip--${due.tone}`)}
              onClick={() => setDialog('due')}
              title="Editar prazo"
              style={{ cursor: 'pointer' }}
            >
              <Icon name="calendar" size={11} />
              {due.label}
            </button>
          )}
          {card.hasChecklist && (
            <button
              type="button"
              className="sf-chip"
              onClick={() => setDialog('checklist')}
              title="Abrir checklist"
              style={{ cursor: 'pointer' }}
            >
              <Icon name="checklist" size={11} />
              Checklist
            </button>
          )}
          {showProcessMeta && processNumber && (
            <span className="sf-card__meta-item" title="Processo vinculado">
              <Icon name="link" size={11} />
              {processNumber}
            </span>
          )}
          {showLocation && (
            <button
              type="button"
              className="sf-card__meta-item"
              onClick={() => setLocationOpen((current) => !current)}
              title="Mover cartão"
              style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
            >
              <Icon name="board" size={11} />
              {locationLabel(card)}
            </button>
          )}
          {card.links.length > 1 && (
            <span className="sf-chip sf-chip--accent" title={card.links.join(', ')}>
              <Icon name="link" size={11} />
              {card.links.length} processos
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

        <div className="sf-card__footer">
          <div className="sf-card__footer-actions">
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={() => setDialog('labels')}
              disabled={busy}
              title="Etiquetas"
            >
              <Icon name="tag" size={14} />
              {actionLabel('Etiquetas')}
            </button>
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={() => setDialog('checklist')}
              disabled={busy}
              title="Checklist"
            >
              <Icon name="checklist" size={14} />
              {actionLabel('Checklist')}
            </button>
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={() => setDialog('due')}
              disabled={busy}
              title="Prazo"
            >
              <Icon name="calendar" size={14} />
              {actionLabel('Prazo')}
            </button>
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={() => setLocationOpen((current) => !current)}
              disabled={busy}
              title="Mover cartão"
            >
              <Icon name="board" size={14} />
              {actionLabel('Mover')}
            </button>
            <button
              type="button"
              className={classNames(
                'sf-btn sf-btn--ghost sf-btn--sm',
                !card.dueComplete && 'sf-card__complete',
              )}
              onClick={() => void toggleComplete()}
              disabled={busy}
              title={card.dueComplete ? 'Reabrir cartão' : 'Concluir cartão'}
            >
              <Icon name={card.dueComplete ? 'refresh' : 'check'} size={14} />
              {actionLabel(card.dueComplete ? 'Reabrir' : 'Concluir')}
            </button>
          </div>

          <div className="sf-card__footer-side">
            {processNumber && (
              <button
                type="button"
                className="sf-icon-btn"
                onClick={() => setConfirmUnlink(true)}
                disabled={busy}
                aria-label="Desvincular deste processo"
                title="Desvincular deste processo"
              >
                <Icon name="unlink" size={15} />
              </button>
            )}
            <button
              type="button"
              className="sf-icon-btn sf-icon-btn--danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              aria-label="Excluir cartão"
              title="Excluir cartão"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      </div>

      {dialog === 'due' && (
        <DueDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'labels' && (
        <LabelsDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {dialog === 'checklist' && (
        <ChecklistDialog card={card} onClose={() => setDialog(null)} onChanged={onChanged} />
      )}
      {confirmUnlink && processNumber && (
        <ConfirmDialog
          title="Desvincular cartão"
          message={`O cartão continuará no Trello, mas deixará de aparecer no processo ${processNumber}.`}
          confirmLabel="Desvincular"
          tone="danger"
          busy={busy}
          onConfirm={() => void unlink()}
          onClose={() => setConfirmUnlink(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Excluir cartão"
          message="O cartão será removido permanentemente do Trello, não apenas deste processo."
          confirmLabel="Excluir do Trello"
          tone="danger"
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
