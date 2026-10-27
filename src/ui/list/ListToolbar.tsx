import { useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { TrelloLabel } from '../../core/domain/types';
import { BrandMark } from '../BrandMark';
import { Icon } from '../icons';
import { useStore } from '../store';
import { activeFilterCount } from '../filters';
import { locationKey, locationLabel } from '../utils';
import { FilterDialog } from './FilterDialog';
import { listStore, loadList, setFilters } from './store';

export function ListToolbar() {
  const state = useStore(listStore);
  const [showFilters, setShowFilters] = useState(false);

  const labels = useMemo(() => {
    const map = new Map<string, TrelloLabel>();
    for (const card of state.cards) {
      for (const label of card.labels) {
        if (!map.has(label.id)) map.set(label.id, label);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [state.cards]);

  const locations = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of state.cards) {
      const key = locationKey(card);
      if (!map.has(key)) map.set(key, locationLabel(card));
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [state.cards]);

  const active = activeFilterCount(state.filters);
  const updated = state.lastUpdated
    ? new Date(state.lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="sf-toolbar">
      <span className="sf-toolbar__brand">
        <BrandMark size={22} className="sf-toolbar__mark" />
        SEI Flow
      </span>

      <span className="sf-toolbar__meta">
        {state.loading
          ? 'sincronizando…'
          : `${state.cards.length} cartão(ões)${updated ? ` · ${updated}` : ''}`}
      </span>

      <span className="sf-toolbar__spacer" />

      <div className="sf-toolbar__search">
        <Icon name="search" size={13} className="sf-toolbar__search-icon" />
        <input
          className="sf-input"
          value={state.filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder="Buscar processo ou cartão…"
          aria-label="Buscar processo ou cartão"
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
        onClick={() => void browser.runtime.openOptionsPage()}
        aria-label="Abrir opções"
        title="Abrir opções"
      >
        <Icon name="settings" size={15} />
      </button>

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

      {showFilters && (
        <FilterDialog
          filters={state.filters}
          labels={labels}
          locations={locations}
          onChange={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
