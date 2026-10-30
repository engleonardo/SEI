import type { TrelloLabel } from '../../core/domain/types';
import { Icon } from '../../ui/icons';
import { labelColorHex, labelTextColor } from '../../ui/utils';
import {
  ACTIVITY_FILTER_OPTIONS,
  DUE_FILTER_OPTIONS,
  PROCESS_UPDATE_OPTIONS,
  activeFilterCount,
  type DashboardFilters,
} from './model';

export interface FilterOption {
  id: string;
  name: string;
}

export interface ListFilterOption extends FilterOption {
  boardId: string;
}

export interface LabelFilterOption {
  label: TrelloLabel;
  count: number;
}

export interface TypeFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface DashboardFiltersProps {
  filters: DashboardFilters;
  boards: FilterOption[];
  lists: ListFilterOption[];
  labels: LabelFilterOption[];
  types: TypeFilterOption[];
  visibleCount: number;
  totalCount: number;
  lastVisit: number;
  onChange: (patch: Partial<DashboardFilters>) => void;
  onClear: () => void;
  onMarkSeen: () => void;
  onExport: () => void;
  showSearch?: boolean;
}

export function DashboardFilters({
  filters,
  boards,
  lists,
  labels,
  types,
  visibleCount,
  totalCount,
  lastVisit,
  onChange,
  onClear,
  onMarkSeen,
  onExport,
  showSearch = true,
}: DashboardFiltersProps) {
  const active = activeFilterCount(filters);
  const lastVisitLabel = lastVisit
    ? new Date(lastVisit).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const toggleLabel = (labelId: string) => {
    const selected = filters.labelIds.includes(labelId);
    onChange({
      labelIds: selected
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
      withoutLabels: false,
    });
  };

  return (
    <section className="sdo-filters">
      <div className={`sdo-filters__top${showSearch ? '' : ' sdo-filters__top--actions-only'}`}>
        {showSearch && (
          <div className="sdo-search">
            <Icon name="search" size={16} />
            <input
              id="sdo-search"
              className="sdo-search__input"
              value={filters.search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder="Buscar cartão, processo, tipo, etiqueta, quadro ou lista…"
              aria-label="Buscar cartão, processo, tipo, etiqueta, quadro ou lista"
              title="Atalho: / ou Ctrl+K"
            />
            {filters.search && (
              <button
                type="button"
                className="sdo-search__clear"
                onClick={() => onChange({ search: '' })}
                aria-label="Limpar busca"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}

        <div className="sdo-filters__actions">
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={onExport}>
            <Icon name="external" size={14} />
            Exportar CSV
          </button>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={onClear}
            disabled={active === 0}
          >
            <Icon name="close" size={14} />
            Limpar filtros
            {active > 0 && <span className="sdo-filter-count">{active}</span>}
          </button>
        </div>
      </div>

      <div className="sdo-filters__grid">
        <label className="sdo-field" htmlFor="sdo-board">
          <span>Quadro</span>
          <select
            id="sdo-board"
            className="sfo-select"
            value={filters.boardId}
            onChange={(event) => onChange({ boardId: event.target.value, listId: '' })}
          >
            <option value="">Todos os quadros</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-list">
          <span>Lista</span>
          <select
            id="sdo-list"
            className="sfo-select"
            value={filters.listId}
            onChange={(event) => onChange({ listId: event.target.value })}
          >
            <option value="">Todas as listas</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-link">
          <span>Vínculo com o SEI</span>
          <select
            id="sdo-link"
            className="sfo-select"
            value={filters.link}
            onChange={(event) =>
              onChange({ link: event.target.value as DashboardFilters['link'] })
            }
          >
            <option value="linked">Somente vinculados</option>
            <option value="unlinked">Somente sem vínculo</option>
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-type">
          <span>Tipo de processo</span>
          <select
            id="sdo-type"
            className="sfo-select"
            value={filters.processType}
            onChange={(event) => onChange({ processType: event.target.value })}
          >
            <option value="">Todos os tipos</option>
            {types.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label} ({type.count})
              </option>
            ))}
            <option value="__none__">Sem tipo informado</option>
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-due">
          <span>Prazo</span>
          <select
            id="sdo-due"
            className="sfo-select"
            value={filters.due}
            onChange={(event) => onChange({ due: event.target.value as DashboardFilters['due'] })}
          >
            {DUE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-activity">
          <span>Atualização no Trello</span>
          <select
            id="sdo-activity"
            className="sfo-select"
            value={filters.activity}
            onChange={(event) =>
              onChange({ activity: event.target.value as DashboardFilters['activity'] })
            }
          >
            {ACTIVITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="sdo-field" htmlFor="sdo-sei">
          <span>Atualização no SEI</span>
          <select
            id="sdo-sei"
            className="sfo-select"
            value={filters.processUpdate}
            onChange={(event) =>
              onChange({
                processUpdate: event.target.value as DashboardFilters['processUpdate'],
              })
            }
          >
            {PROCESS_UPDATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="sdo-tags">
        <div className="sdo-tags__head">
          <span className="sdo-tags__title">
            <Icon name="tag" size={14} /> Etiquetas
          </span>
          <span className="sdo-tags__hint">Clique para filtrar. Use várias para combinar.</span>
        </div>
        <div className="sdo-tags__list">
          <button
            type="button"
            className={`sdo-tag sdo-tag--plain${filters.withoutLabels ? ' sdo-tag--active' : ''}`}
            onClick={() =>
              onChange({
                withoutLabels: !filters.withoutLabels,
                labelIds: [],
              })
            }
          >
            Sem etiqueta
          </button>
          {labels.map(({ label, count }) => {
            const selected = filters.labelIds.includes(label.id);
            return (
              <button
                type="button"
                key={label.id}
                className={`sdo-tag${selected ? ' sdo-tag--active' : ''}`}
                style={{
                  backgroundColor: labelColorHex(label.color),
                  color: labelTextColor(label.color),
                }}
                onClick={() => toggleLabel(label.id)}
                title={`${label.name || label.color || 'Etiqueta'} · ${count} cartão(ões)`}
                aria-pressed={selected}
              >
                {label.name || label.color || 'Etiqueta'}
                <span className="sdo-tag__count">{count}</span>
              </button>
            );
          })}
          {labels.length === 0 && (
            <span className="sdo-tags__hint">Nenhuma etiqueta encontrada nos cartões vinculados.</span>
          )}
        </div>
      </div>

      <div className="sdo-filters__footer">
        <span>
          <strong>{visibleCount}</strong> de <strong>{totalCount}</strong> cartão(ões)
          {active > 0 ? ` · ${active} filtro(s) ativo(s)` : ''}
        </span>
        <span className="sdo-filters__visit">
          <Icon name="clock" size={13} />
          Última visita: {lastVisitLabel ?? 'agora'}
          <button type="button" className="sdo-link-btn" onClick={onMarkSeen}>
            Marcar atualizações como vistas
          </button>
        </span>
      </div>
    </section>
  );
}
