import { useMemo, useState } from 'react';
import type { TrelloLabel } from '../../core/domain/types';
import { BrandMark } from '../BrandMark';
import { Icon } from '../icons';
import { useStore } from '../store';
import { activeFilterCount, type DueFilter } from '../filters';
import { openDashboard, openOptionsPage } from '../../core/messaging/actions';
import { FilterDialog, type FilterOption, type ListOption } from './FilterDialog';
import { BulkLinkDialog } from '../components/BulkLinkDialog';
import { listStore, loadList, setFilters } from './store';

const DUE_LABELS: Record<DueFilter, string> = {
  any: '',
  open: 'Em aberto',
  overdue: 'Atrasados',
  complete: 'Concluídos',
  none: 'Sem prazo',
};

export function ListToolbar() {
  const state = useStore(listStore);
  const [showFilters, setShowFilters] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const labels = useMemo(() => {
    const map = new Map<string, TrelloLabel>();
    for (const card of state.cards) {
      for (const label of card.labels) {
        if (!map.has(label.id)) map.set(label.id, label);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [state.cards]);

  const boards = useMemo<FilterOption[]>(() => {
    const map = new Map<string, string>();
    for (const card of state.cards) {
      if (card.idBoard && !map.has(card.idBoard)) {
        map.set(card.idBoard, card.board?.name ?? 'Quadro');
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [state.cards]);

  const lists = useMemo<ListOption[]>(() => {
    const map = new Map<string, ListOption>();
    for (const card of state.cards) {
      if (card.idList && !map.has(card.idList)) {
        map.set(card.idList, {
          id: card.idList,
          name: card.list?.name ?? 'Lista',
          boardId: card.idBoard,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [state.cards]);

  const active = activeFilterCount(state.filters);
  const brandTitle = state.lastUpdated
    ? `${state.cards.length} ${state.cards.length === 1 ? 'cartão' : 'cartões'} · atualizado às ${new Date(
        state.lastUpdated,
      ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : `${state.cards.length} ${state.cards.length === 1 ? 'cartão' : 'cartões'}`;

  const activeChips: string[] = [];
  if (state.filters.noCard) activeChips.push('Sem cartão');
  if (state.filters.withCard) activeChips.push('Com cartão');
  if (state.filters.due !== 'any') activeChips.push(DUE_LABELS[state.filters.due]);
  for (const labelId of state.filters.labelIds) {
    const label = labels.find((item) => item.id === labelId);
    if (label) activeChips.push(label.name || label.color || 'Etiqueta');
  }
  if (state.filters.boardId) {
    const board = boards.find((item) => item.id === state.filters.boardId);
    if (board) activeChips.push(board.name);
  }
  for (const listId of state.filters.listIds) {
    const list = lists.find((item) => item.id === listId);
    if (list) activeChips.push(list.name);
  }

  const clearFilters = () =>
    setFilters({
      search: '',
      noCard: false,
      withCard: false,
      due: 'any',
      labelIds: [],
      boardId: '',
      listIds: [],
    });

  return (
    <div className="sf-toolbar">
      <div className="sf-toolbar__brand" title={state.loading ? 'Sincronizando…' : brandTitle}>
        <BrandMark size={26} className="sf-toolbar__mark" />
      </div>

      <div className="sf-toolbar__search">
        <Icon name="search" size={13} className="sf-toolbar__search-icon" />
        <input
          className="sf-input"
          value={state.filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder="Buscar processo ou cartão…"
          aria-label="Buscar processo ou cartão"
          title="Buscar processo ou cartão (atalho: / ou Ctrl+K)"
        />
      </div>

      <button
        type="button"
        className="sf-btn sf-btn--sm"
        onClick={() => setShowFilters(true)}
        aria-label="Abrir filtros"
      >
        <Icon name="filter" size={13} />
        Filtros
        {active > 0 && <span className="sf-filter-count">{active}</span>}
      </button>

      {active > 0 && (
        <button
          type="button"
          className="sf-icon-btn"
          onClick={clearFilters}
          aria-label="Limpar filtros"
          title="Limpar filtros"
        >
          <Icon name="close" size={15} />
        </button>
      )}

      <button
        type="button"
        className="sf-icon-btn"
        onClick={() => void loadList()}
        disabled={state.loading}
        aria-label="Atualizar lista"
        title="Atualizar lista"
      >
        <Icon name="refresh" size={15} />
      </button>

      <button
        type="button"
        className="sf-icon-btn"
        onClick={() => void openDashboard()}
        aria-label="Abrir dashboard de prazos"
        title="Abrir dashboard de prazos"
      >
        <Icon name="board" size={15} />
      </button>

      <button
        type="button"
        className="sf-icon-btn"
        onClick={() => setShowBulk(true)}
        aria-label="Vincular cartões a vários processos"
        title="Vincular cartões a vários processos"
      >
        <Icon name="link" size={15} />
      </button>

      <button
        type="button"
        className="sf-icon-btn"
        onClick={() => void openOptionsPage()}
        aria-label="Abrir opções"
        title="Abrir opções"
      >
        <Icon name="settings" size={15} />
      </button>

      <span className="sf-toolbar__spacer" />

      {state.error && (
        <button
          type="button"
          className="sf-chip sf-chip--danger"
          title={state.error}
          onClick={() => void loadList()}
          style={{ border: 0, cursor: 'pointer' }}
        >
          <Icon name="alert" size={11} />
          Erro ao sincronizar · tentar de novo
        </button>
      )}

      {activeChips.length > 0 && (
        <div className="sf-toolbar__active">
          <span className="sf-toolbar__active-label">Filtros ativos:</span>
          {activeChips.map((chip, index) => (
            <span key={`${chip}-${index}`} className="sf-chip sf-chip--accent">
              {chip}
            </span>
          ))}
          <button type="button" className="sf-btn sf-btn--ghost sf-btn--sm" onClick={clearFilters}>
            Limpar
          </button>
        </div>
      )}

      {showFilters && (
        <FilterDialog
          filters={state.filters}
          labels={labels}
          boards={boards}
          lists={lists}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {showBulk && (
        <BulkLinkDialog
          onClose={() => setShowBulk(false)}
          onDone={() => void loadList()}
        />
      )}
    </div>
  );
}
