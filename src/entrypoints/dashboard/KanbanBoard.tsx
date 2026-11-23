import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { TrelloCard } from '../../core/domain/types';
import type { ProcessCatalog } from '../../core/storage/processes';
import { Icon } from '../../ui/icons';
import { classNames } from '../../ui/utils';
import { DashboardCard } from './DashboardCard';
import type { CardGroup } from './model';

/**
 * Teclado: cada seta para o lado salta direto para a coluna vizinha,
 * em vez de deslocar 25px (que variava com o tamanho da janela).
 */
const columnKeyboardCoordinateGetter: KeyboardCoordinateGetter = (event, args) => {
  const { currentCoordinates, context } = args;
  const rect = context.collisionRect;
  if (!rect) return undefined;

  const direction = event.code === KeyboardCode.Right ? 1 : event.code === KeyboardCode.Left ? -1 : 0;
  if (direction === 0) return undefined;

  const origin = rect.left + rect.width / 2;
  const targets = context.droppableContainers
    .getEnabled()
    .map((container) => {
      const droppableRect = context.droppableRects.get(container.id);
      if (!droppableRect || !container.data.current?.listId) return null;
      const center = droppableRect.left + droppableRect.width / 2;
      // Ignora a coluna atual: o centro dela quase coincide com o do cartão.
      if (Math.abs(center - origin) < 8) return null;
      if (direction > 0 ? center < origin : center > origin) return null;
      return { center, distance: Math.abs(center - origin) };
    })
    .filter((target): target is { center: number; distance: number } => target !== null)
    .sort((a, b) => a.distance - b.distance);

  const next = targets[0];
  if (!next) return undefined;

  return {
    x: currentCoordinates.x + (next.center - origin),
    y: currentCoordinates.y,
  };
};

interface KanbanBoardProps {
  groups: CardGroup[];
  catalog: ProcessCatalog;
  pinned: Set<string>;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onToggleLabel: (labelId: string) => void;
  onProcessesRead: (numbers: string[]) => void;
  onTogglePin: (cardId: string) => void;
  onMoveCard: (cardId: string, targetListId: string) => void | Promise<void>;
  onMoveColumn?: (listId: string, direction: 'left' | 'right') => void;
  canMoveColumns?: boolean;
  onAddCard?: (boardId: string, listId: string) => void;
  canManageLists?: boolean;
  onRenameList?: (listId: string, name: string) => Promise<void>;
  onCreateList?: (name: string) => Promise<void>;
}

function listIdFromGroup(group: CardGroup): string {
  const index = group.key.indexOf(':');
  return index >= 0 ? group.key.slice(index + 1) : group.key;
}

function boardIdFromGroup(group: CardGroup): string {
  const index = group.key.indexOf(':');
  return index >= 0 ? group.key.slice(0, index) : '';
}

function KanbanCard({
  card,
  group,
  catalog,
  pinned,
  onChanged,
  onRemoved,
  onToggleLabel,
  onProcessesRead,
  onTogglePin,
}: {
  card: TrelloCard;
  group: CardGroup;
  catalog: ProcessCatalog;
  pinned: Set<string>;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onToggleLabel: (labelId: string) => void;
  onProcessesRead: (numbers: string[]) => void;
  onTogglePin: (cardId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classNames('sdo-kanban-card', isDragging && 'sdo-kanban-card--dragging')}
      data-board={group.subtitle ?? ''}
    >
      <DashboardCard
        card={card}
        catalog={catalog}
        pinned={pinned.has(card.id)}
        dense
        dragHandle={
          <button
            type="button"
            className="sdo-card__drag"
            {...listeners}
            {...attributes}
            aria-label={`Arrastar cartão ${card.name}`}
            title="Arrastar cartão"
          >
            <Icon name="grip" size={12} />
          </button>
        }
        onChanged={onChanged}
        onRemoved={onRemoved}
        onToggleLabel={onToggleLabel}
        onProcessesRead={onProcessesRead}
        onTogglePin={onTogglePin}
      />
    </div>
  );
}

function KanbanColumn({
  group,
  index,
  total,
  canMoveColumns,
  onMoveColumn,
  onAddCard,
  onRenameList,
  catalog,
  pinned,
  onChanged,
  onRemoved,
  onToggleLabel,
  onProcessesRead,
  onTogglePin,
}: {
  group: CardGroup;
  index: number;
  total: number;
  canMoveColumns: boolean;
  onMoveColumn?: (listId: string, direction: 'left' | 'right') => void;
  onAddCard?: (boardId: string, listId: string) => void;
  onRenameList?: (listId: string, name: string) => Promise<void>;
  catalog: ProcessCatalog;
  pinned: Set<string>;
  onChanged: (card: TrelloCard) => void;
  onRemoved: (cardId: string) => void;
  onToggleLabel: (labelId: string) => void;
  onProcessesRead: (numbers: string[]) => void;
  onTogglePin: (cardId: string) => void;
}) {
  const listId = listIdFromGroup(group);
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${group.key}`,
    data: { listId },
  });
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [titleBusy, setTitleBusy] = useState(false);

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === group.title) {
      setEditingTitle(false);
      setTitleDraft(group.title);
      return;
    }
    setTitleBusy(true);
    try {
      await onRenameList?.(listId, next);
      setEditingTitle(false);
    } finally {
      setTitleBusy(false);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={classNames('sdo-kanban-column', isOver && 'sdo-kanban-column--over')}
      aria-label={`Coluna ${group.title}`}
    >
      <header className="sdo-kanban-column__head">
        <span className="sdo-kanban-column__dot" />
        {editingTitle ? (
          <input
            className="sdo-kanban-column__title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void saveTitle();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setTitleDraft(group.title);
                setEditingTitle(false);
              }
            }}
            autoFocus
            disabled={titleBusy}
            aria-label="Nome da lista"
          />
        ) : (
          <span className="sdo-kanban-column__title">{group.title}</span>
        )}
        <span className="sdo-kanban-column__count">{group.cards.length}</span>
        {(onRenameList || (canMoveColumns && onMoveColumn)) && (
          <div className="sdo-kanban-column__actions">
            {onRenameList && !editingTitle && (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(group.title);
                  setEditingTitle(true);
                }}
                title="Renomear lista"
                aria-label={`Renomear lista ${group.title}`}
              >
                <Icon name="edit" size={13} />
              </button>
            )}
            {canMoveColumns && onMoveColumn && (
              <>
                <button
                  type="button"
                  onClick={() => onMoveColumn(listId, 'left')}
                  disabled={index === 0}
                  title="Mover coluna para a esquerda"
                  aria-label={`Mover coluna ${group.title} para a esquerda`}
                >
                  <Icon name="chevronLeft" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveColumn(listId, 'right')}
                  disabled={index === total - 1}
                  title="Mover coluna para a direita"
                  aria-label={`Mover coluna ${group.title} para a direita`}
                >
                  <Icon name="chevronRight" size={13} />
                </button>
              </>
            )}
          </div>
        )}
        {group.subtitle && <span className="sdo-kanban-column__board">{group.subtitle}</span>}
      </header>
      <div className="sdo-kanban-column__body">
        {group.cards.map((card) => (
          <KanbanCard
            key={card.id}
            card={card}
            group={group}
            catalog={catalog}
            pinned={pinned}
            onChanged={onChanged}
            onRemoved={onRemoved}
            onToggleLabel={onToggleLabel}
            onProcessesRead={onProcessesRead}
            onTogglePin={onTogglePin}
          />
        ))}
      </div>
      {onAddCard && (
        <button
          type="button"
          className="sdo-kanban-add"
          onClick={() => onAddCard(boardIdFromGroup(group), listId)}
        >
          <Icon name="plus" size={13} />
          Adicionar cartão
        </button>
      )}
    </section>
  );
}

function AddListColumn({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    try {
      await onCreate(next);
      setName('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sdo-kanban-column sdo-kanban-column--add" aria-label="Adicionar lista">
      {open ? (
        <>
          <input
            className="sdo-inline-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setName('');
                setOpen(false);
              }
            }}
            placeholder="Nome da lista"
            autoFocus
            disabled={busy}
            aria-label="Nome da nova lista"
          />
          <div className="sdo-list-card__edit-actions">
            <button
              type="button"
              className="sfo-btn sfo-btn--sm sfo-btn--primary"
              onClick={() => void submit()}
              disabled={busy || !name.trim()}
            >
              {busy ? <span className="sfo-spinner" /> : <Icon name="plus" size={12} />}
              Criar
            </button>
            <button
              type="button"
              className="sfo-btn sfo-btn--sm"
              onClick={() => {
                setName('');
                setOpen(false);
              }}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="sdo-kanban-add" onClick={() => setOpen(true)}>
          <Icon name="plus" size={14} />
          Adicionar lista
        </button>
      )}
    </section>
  );
}

export function KanbanBoard({
  groups,
  catalog,
  pinned,
  onChanged,
  onRemoved,
  onToggleLabel,
  onProcessesRead,
  onTogglePin,
  onMoveCard,
  onMoveColumn,
  canMoveColumns = false,
  onAddCard,
  canManageLists = false,
  onRenameList,
  onCreateList,
}: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinateGetter }),
  );
  const [activeCard, setActiveCard] = useState<TrelloCard | null>(null);

  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args);
    if (pointer.length > 0) return pointer;
    const intersection = rectIntersection(args);
    return intersection.length > 0 ? intersection : closestCorners(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const card = event.active.data.current?.card as TrelloCard | undefined;
    setActiveCard(card ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    const card = event.active.data.current?.card as TrelloCard | undefined;
    const targetListId = event.over?.data.current?.listId as string | undefined;
    if (!card || !targetListId || card.idList === targetListId) return;
    void onMoveCard(card.id, targetListId);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveCard(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="sdo-kanban" role="list" aria-label="Quadro Kanban">
        {groups.map((group, index) => (
          <KanbanColumn
            key={group.key}
            group={group}
            index={index}
            total={groups.length}
            canMoveColumns={canMoveColumns}
            onMoveColumn={onMoveColumn}
            onAddCard={onAddCard}
            onRenameList={onRenameList}
            catalog={catalog}
            pinned={pinned}
            onChanged={onChanged}
            onRemoved={onRemoved}
            onToggleLabel={onToggleLabel}
            onProcessesRead={onProcessesRead}
            onTogglePin={onTogglePin}
          />
        ))}
        {canManageLists && onCreateList && <AddListColumn onCreate={onCreateList} />}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeCard ? (
          <div className="sdo-kanban-overlay">
            <Icon name="columns" size={13} />
            {activeCard.name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
