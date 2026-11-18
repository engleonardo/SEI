import { useEffect, useRef, useState, type DOMAttributes, type KeyboardEventHandler } from 'react';
import {
  DndContext,
  DragOverlay,
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
} from '@dnd-kit/core';
import type { TrelloCard } from '../../core/domain/types';
import type { ProcessCatalog } from '../../core/storage/processes';
import { Icon } from '../../ui/icons';
import { classNames } from '../../ui/utils';
import { DashboardCard } from './DashboardCard';
import type { CardGroup } from './model';

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
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const pointerListeners = (listeners
    ? { onPointerDown: listeners.onPointerDown, onTouchStart: listeners.onTouchStart }
    : {}) as Pick<DOMAttributes<HTMLDivElement>, 'onPointerDown' | 'onTouchStart'>;
  const dragged = useRef(false);

  useEffect(() => {
    if (isDragging) {
      dragged.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      dragged.current = false;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={classNames('sdo-kanban-card', isDragging && 'sdo-kanban-card--dragging')}
      data-board={group.subtitle ?? ''}
      {...pointerListeners}
      onClickCapture={(event) => {
        if (!dragged.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        className="sdo-kanban-card__a11y"
        {...attributes}
        onKeyDown={listeners?.onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
        aria-label={`Mover cartão ${card.name}. Pressione Espaço, use as setas e confirme com Espaço.`}
      />
      <DashboardCard
        card={card}
        catalog={catalog}
        pinned={pinned.has(card.id)}
        dense
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

  return (
    <section
      ref={setNodeRef}
      className={classNames('sdo-kanban-column', isOver && 'sdo-kanban-column--over')}
      aria-label={`Coluna ${group.title}`}
    >
      <header className="sdo-kanban-column__head">
        <span className="sdo-kanban-column__dot" />
        <span className="sdo-kanban-column__title">{group.title}</span>
        <span className="sdo-kanban-column__count">{group.cards.length}</span>
        {canMoveColumns && onMoveColumn && (
          <div className="sdo-kanban-column__actions">
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
}: KanbanBoardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor),
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
