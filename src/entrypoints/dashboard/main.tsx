import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Settings, TrelloCard } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import { BrandMark } from '../../ui/BrandMark';
import { Icon } from '../../ui/icons';
import {
  classNames,
  formatDue,
  labelColorHex,
  labelTextColor,
  locationLabel,
} from '../../ui/utils';
import '../options/style.css';
import './style.css';

type Bucket = 'overdue' | 'today' | 'soon' | 'later' | 'none' | 'done';

const BUCKETS: Array<{ key: Bucket; title: string; tone: string }> = [
  { key: 'overdue', title: 'Atrasados', tone: 'danger' },
  { key: 'today', title: 'Vencem hoje', tone: 'warning' },
  { key: 'soon', title: 'Próximos 7 dias', tone: 'accent' },
  { key: 'later', title: 'Mais adiante', tone: 'neutral' },
  { key: 'none', title: 'Sem prazo', tone: 'neutral' },
  { key: 'done', title: 'Concluídos', tone: 'success' },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function bucketFor(card: TrelloCard): Bucket {
  if (card.dueComplete) return 'done';
  if (!card.due) return 'none';
  const due = startOfDay(new Date(card.due));
  const today = startOfDay(new Date());
  if (due.getTime() < today.getTime()) return 'overdue';
  if (due.getTime() === today.getTime()) return 'today';
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  if (due.getTime() <= soon.getTime()) return 'soon';
  return 'later';
}

function Dashboard() {
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [boardId, setBoardId] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextCards, nextSettings] = await Promise.all([
        callRpc('trello:all-linked-cards', undefined),
        callRpc('settings:get', undefined),
      ]);
      setCards(nextCards);
      setSettings(nextSettings);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const boards = useMemo(() => {
    const map = new Map<string, string>();
    for (const card of cards) {
      if (card.idBoard && !map.has(card.idBoard)) {
        map.set(card.idBoard, card.board?.name ?? 'Quadro');
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [cards]);

  const visibleCards = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (boardId && card.idBoard !== boardId) return false;
      if (onlyOverdue && bucketFor(card) !== 'overdue') return false;
      if (!needle) return true;
      const haystack = [
        card.name,
        card.description,
        card.board?.name ?? '',
        card.list?.name ?? '',
        ...card.links,
        ...card.labels.map((label) => label.name),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [boardId, cards, onlyOverdue, search]);

  const grouped = useMemo(() => {
    const map: Record<Bucket, TrelloCard[]> = {
      overdue: [],
      today: [],
      soon: [],
      later: [],
      none: [],
      done: [],
    };
    for (const card of visibleCards) map[bucketFor(card)].push(card);
    for (const key of Object.keys(map) as Bucket[]) {
      map[key].sort((a, b) => {
        if (!a.due && !b.due) return a.name.localeCompare(b.name, 'pt-BR');
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due).getTime() - new Date(b.due).getTime();
      });
    }
    return map;
  }, [visibleCards]);

  const counts = {
    total: cards.length,
    overdue: grouped.overdue.length,
    today: grouped.today.length,
    soon: grouped.soon.length,
    none: grouped.none.length,
    done: grouped.done.length,
  };

  return (
    <div className="sdo-page">
      <header className="sdo-header">
        <div className="sdo-brand">
          <BrandMark size={46} />
          <div>
            <h1>Dashboard de prazos</h1>
            <p>Visão consolidada dos cartões vinculados aos processos do SEI.</p>
          </div>
        </div>
        <div className="sdo-actions">
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => void load()}>
            <Icon name="refresh" size={14} />
            Atualizar
          </button>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void openOptionsPage()}
          >
            <Icon name="settings" size={14} />
            Opções
          </button>
        </div>
      </header>

      {error && (
        <div className="sfo-alert sfo-alert--error">
          <Icon name="alert" size={16} />
          <div style={{ flex: 1 }}>{error}</div>
          <button type="button" className="sfo-btn sfo-btn--sm" onClick={() => void load()}>
            Tentar novamente
          </button>
        </div>
      )}

      {!settings?.defaultListId && !loading && !error && (
        <div className="sfo-alert sfo-alert--warning">
          <Icon name="alert" size={16} />
          <div style={{ flex: 1 }}>
            Configure a conexão e o destino padrão para ver os cartões do Trello.
          </div>
          <button
            type="button"
            className="sfo-btn sfo-btn--sm"
            onClick={() => void openOptionsPage()}
          >
            Abrir opções
          </button>
        </div>
      )}

      <section className="sdo-summary">
        <div className="sdo-summary-card sdo-summary-card--danger">
          <span>Atrasados</span>
          <strong>{counts.overdue}</strong>
        </div>
        <div className="sdo-summary-card sdo-summary-card--warning">
          <span>Vencem hoje</span>
          <strong>{counts.today}</strong>
        </div>
        <div className="sdo-summary-card sdo-summary-card--accent">
          <span>Próximos 7 dias</span>
          <strong>{counts.soon}</strong>
        </div>
        <div className="sdo-summary-card">
          <span>Sem prazo</span>
          <strong>{counts.none}</strong>
        </div>
        <div className="sdo-summary-card">
          <span>Total vinculado</span>
          <strong>{counts.total}</strong>
        </div>
      </section>

      <section className="sdo-filters sfo-card">
        <div className="sfo-card__body" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sfo-field" style={{ flex: '1 1 260px' }}>
            <label htmlFor="sdo-search">Buscar</label>
            <input
              id="sdo-search"
              className="sfo-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, processo, etiqueta, quadro ou lista…"
            />
          </div>
          <div className="sfo-field" style={{ flex: '0 1 220px' }}>
            <label htmlFor="sdo-board">Quadro</label>
            <select
              id="sdo-board"
              className="sfo-select"
              value={boardId}
              onChange={(event) => setBoardId(event.target.value)}
            >
              <option value="">Todos os quadros</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </div>
          <label className="sfo-toggle-row" style={{ flex: '0 0 auto', border: 0, background: 'transparent', padding: 0 }}>
            <input
              type="checkbox"
              checked={onlyOverdue}
              onChange={(event) => setOnlyOverdue(event.target.checked)}
            />
            <span className="sfo-toggle-row__body">
              <span className="sfo-toggle-row__title">Somente atrasados</span>
            </span>
          </label>
        </div>
      </section>

      {loading ? (
        <div className="sdo-loading">
          <span className="sfo-spinner" />
          <span>Carregando cartões…</span>
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="sfo-empty" style={{ padding: 40 }}>
          Nenhum cartão encontrado com os filtros atuais.
        </div>
      ) : (
        BUCKETS.map((bucket) => {
          const bucketCards = grouped[bucket.key];
          if (bucketCards.length === 0) return null;
          return (
            <section key={bucket.key} className="sdo-section">
              <h2>
                <span className={classNames('sdo-dot', `sdo-dot--${bucket.tone}`)} />
                {bucket.title}
                <span className="sdo-count">{bucketCards.length}</span>
              </h2>
              <div className="sdo-list">
                {bucketCards.map((card) => {
                  const due = formatDue(card.due, card.dueComplete);
                  return (
                    <article key={card.id} className="sdo-card">
                      <div className="sdo-card__main">
                        <h3>{card.name}</h3>
                        <div className="sdo-card__labels">
                          {card.labels.map((label) => (
                            <span
                              key={label.id}
                              className="sf-label-chip"
                              style={{
                                backgroundColor: labelColorHex(label.color),
                                color: labelTextColor(label.color),
                              }}
                            >
                              {label.name || label.color || 'Etiqueta'}
                            </span>
                          ))}
                        </div>
                        <div className="sdo-card__meta">
                          <span>
                            <Icon name="board" size={12} /> {locationLabel(card)}
                          </span>
                          {card.links.map((process) => (
                            <span key={process} className="sdo-process">
                              <Icon name="link" size={12} /> {process}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="sdo-card__side">
                        {due && (
                          <span className={`sfo-pill sfo-pill--${due.tone === 'neutral' ? 'accent' : due.tone}`}>
                            <Icon name="calendar" size={11} />
                            {due.label}
                          </span>
                        )}
                        <a className="sfo-btn sfo-btn--sm" href={card.shortUrl} target="_blank" rel="noreferrer">
                          <Icon name="external" size={13} />
                          Trello
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}

      <footer className="sdo-footer">
        <span>SEI Flow · dashboard de prazos</span>
        <a href="https://github.com/engleonardo/SEI" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Dashboard />);
