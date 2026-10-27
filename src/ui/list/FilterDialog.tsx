import type { TrelloLabel } from '../../core/domain/types';
import { activeFilterCount, type DueFilter, type ListFilters } from '../filters';
import { Icon, type IconName } from '../icons';
import { classNames, labelColorHex, labelTextColor } from '../utils';
import { Modal } from '../components/Modal';

export interface FilterOption {
  id: string;
  name: string;
}

export interface ListOption extends FilterOption {
  boardId: string;
}

export interface FilterDialogProps {
  filters: ListFilters;
  labels: TrelloLabel[];
  boards: FilterOption[];
  lists: ListOption[];
  onChange: (patch: Partial<ListFilters>) => void;
  onClose: () => void;
}

const DUE_OPTIONS: Array<{ key: DueFilter; label: string; icon: IconName }> = [
  { key: 'open', label: 'Em aberto', icon: 'clock' },
  { key: 'overdue', label: 'Atrasados', icon: 'alert' },
  { key: 'complete', label: 'Concluídos', icon: 'check' },
  { key: 'none', label: 'Sem prazo', icon: 'calendar' },
];

export function FilterDialog({
  filters,
  labels,
  boards,
  lists,
  onChange,
  onClose,
}: FilterDialogProps) {
  const toggleLabel = (labelId: string) => {
    const next = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((id) => id !== labelId)
      : [...filters.labelIds, labelId];
    onChange({ labelIds: next });
  };

  const toggleList = (listId: string) => {
    const next = filters.listIds.includes(listId)
      ? filters.listIds.filter((id) => id !== listId)
      : [...filters.listIds, listId];
    onChange({ listIds: next });
  };

  const selectBoard = (boardId: string) => {
    onChange({
      boardId: filters.boardId === boardId ? '' : boardId,
      listIds: [],
    });
  };

  const availableLists = filters.boardId
    ? lists.filter((list) => list.boardId === filters.boardId)
    : [];

  const clear = () =>
    onChange({
      noCard: false,
      withCard: false,
      due: 'any',
      labelIds: [],
      boardId: '',
      listIds: [],
    });

  return (
    <Modal
      title="Filtros"
      subtitle="Refine os processos exibidos na lista"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="sf-modal__footer-left">{activeFilterCount(filters)} ativo(s)</span>
          <button type="button" className="sf-btn" onClick={clear}>
            Limpar
          </button>
          <button type="button" className="sf-btn sf-btn--primary" onClick={onClose}>
            Aplicar
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sf-field" style={{ paddingBottom: 10 }}>
          <label htmlFor="sf-filter-search">Buscar processo ou cartão</label>
          <input
            id="sf-filter-search"
            className="sf-input"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Número, especificação ou nome do cartão…"
            data-autofocus
            autoFocus
          />
        </div>

        <div className="sf-filter-group">
          <h3 className="sf-filter-group__title">Quadro</h3>
          <div className="sf-filter-options">
            <button
              type="button"
              className={classNames(
                'sf-filter-option',
                !filters.boardId && 'sf-filter-option--active',
              )}
              onClick={() => onChange({ boardId: '', listIds: [] })}
              aria-pressed={!filters.boardId}
            >
              <Icon name="board" size={12} />
              Todos os quadros
            </button>
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                className={classNames(
                  'sf-filter-option',
                  filters.boardId === board.id && 'sf-filter-option--active',
                )}
                onClick={() => selectBoard(board.id)}
                aria-pressed={filters.boardId === board.id}
              >
                <Icon name="board" size={12} />
                {board.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sf-filter-group">
          <h3 className="sf-filter-group__title">Lista</h3>
          {!filters.boardId ? (
            <span className="sf-hint">Selecione um quadro acima para filtrar por lista.</span>
          ) : availableLists.length === 0 ? (
            <span className="sf-hint">Nenhuma lista encontrada neste quadro.</span>
          ) : (
            <div className="sf-filter-options">
              {availableLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  className={classNames(
                    'sf-filter-option',
                    filters.listIds.includes(list.id) && 'sf-filter-option--active',
                  )}
                  onClick={() => toggleList(list.id)}
                  aria-pressed={filters.listIds.includes(list.id)}
                >
                  <Icon name="list" size={12} />
                  {list.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {labels.length > 0 && (
          <div className="sf-filter-group">
            <h3 className="sf-filter-group__title">Etiquetas</h3>
            <div className="sf-filter-options">
              {labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className={classNames(
                    'sf-filter-option',
                    filters.labelIds.includes(label.id) && 'sf-filter-option--active',
                  )}
                  onClick={() => toggleLabel(label.id)}
                  aria-pressed={filters.labelIds.includes(label.id)}
                >
                  <span
                    className="sf-label-chip"
                    style={{
                      backgroundColor: labelColorHex(label.color),
                      color: labelTextColor(label.color),
                    }}
                  >
                    {label.name || label.color || 'Etiqueta'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="sf-filter-group">
          <h3 className="sf-filter-group__title">Data de entrega</h3>
          <div className="sf-filter-options">
            {DUE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={classNames(
                  'sf-filter-option',
                  filters.due === option.key && 'sf-filter-option--active',
                )}
                onClick={() => onChange({ due: filters.due === option.key ? 'any' : option.key })}
                aria-pressed={filters.due === option.key}
              >
                <Icon name={option.icon} size={12} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sf-filter-group">
          <h3 className="sf-filter-group__title">Processos</h3>
          <div className="sf-filter-options">
            <button
              type="button"
              className={classNames('sf-filter-option', filters.noCard && 'sf-filter-option--active')}
              onClick={() => onChange({ noCard: !filters.noCard, withCard: false })}
              aria-pressed={filters.noCard}
            >
              <Icon name={filters.noCard ? 'check' : 'plus'} size={12} />
              Sem cartão
            </button>
            <button
              type="button"
              className={classNames(
                'sf-filter-option',
                filters.withCard && 'sf-filter-option--active',
              )}
              onClick={() => onChange({ withCard: !filters.withCard, noCard: false })}
              aria-pressed={filters.withCard}
            >
              <Icon name={filters.withCard ? 'check' : 'plus'} size={12} />
              Com cartão
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
