import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { TrelloBoard, TrelloCard } from '../../core/domain/types';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { showToast } from '../toast';
import { classNames, formatDue, labelColorHex, labelTextColor, locationLabel } from '../utils';
import { ErrorState, Spinner } from './common';
import { Modal } from './Modal';

export interface LinkCardsDialogProps {
  processNumber: string;
  onClose: () => void;
  onLinked: (cards: TrelloCard[]) => void;
}

export function LinkCardsDialog({ processNumber, onClose, onLinked }: LinkCardsDialogProps) {
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [boardId, setBoardId] = useState('');
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [search, setSearch] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([callRpc('settings:get', undefined), callRpc('trello:boards', undefined)])
      .then(([nextSettings, nextBoards]) => {
        if (!active) return;
        setBoards(nextBoards);
        const preferred =
          nextBoards.find((board) => board.id === nextSettings.defaultBoardId) ?? nextBoards[0];
        if (preferred) setBoardId(preferred.id);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelected(new Set());
    callRpc('trello:board-cards', { boardId })
      .then((value) => {
        if (active) setCards(value);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [boardId]);

  const visibleCards = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (onlyUnlinked && card.links.length > 0) return false;
      if (!needle) return true;
      const haystack = [card.name, card.description, ...card.labels.map((label) => label.name)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [cards, onlyUnlinked, search]);

  const toggle = (cardId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(visibleCards.map((card) => card.id)));
  };

  const link = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      const results = await callRpc('trello:link-cards', {
        cardIds: Array.from(selected),
        processNumber,
      });
      const successful = results
        .filter((result) => (result.status === 'linked' || result.status === 'already') && result.card)
        .map((result) => result.card as TrelloCard);
      const failures = results.filter((result) => result.status === 'error');
      const linked = results.filter((result) => result.status === 'linked').length;
      const already = results.filter((result) => result.status === 'already').length;

      if (successful.length > 0) onLinked(successful);

      if (failures.length > 0) {
        setErrors(failures.map((failure) => failure.message ?? `Falha no cartão ${failure.cardId}`));
        setSelected(new Set(failures.map((failure) => failure.cardId)));
        showToast(
          `${linked} vinculado(s), ${already} já vinculado(s), ${failures.length} com erro.`,
          'error',
          7000,
        );
        return;
      }

      showToast(
        `${linked} cartão(ões) vinculado(s)${already > 0 ? `; ${already} já estavam vinculados` : ''}.`,
        'success',
      );
      onClose();
    } catch (cause) {
      const message = errorMessage(cause);
      setErrors([message]);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const noBoards = !loading && boards.length === 0;
  const defaultBoard = boards.find((board) => board.id === boardId);

  return (
    <Modal
      title="Vincular cartões existentes"
      subtitle={`Processo ${processNumber}`}
      onClose={onClose}
      footer={
        <>
          <span className="sf-modal__footer-left">
            {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Selecione um ou mais cartões'}
          </span>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--primary"
            onClick={() => void link()}
            disabled={busy || selected.size === 0}
          >
            {busy ? <Spinner /> : <Icon name="link" size={14} />}
            Vincular {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </>
      }
    >
      {noBoards ? (
        <ErrorState
          message="Nenhum quadro do Trello foi encontrado. Verifique as credenciais nas opções."
          extra={
            <button
              type="button"
              className="sf-btn sf-btn--sm"
              onClick={() => void browser.runtime.openOptionsPage()}
            >
              Abrir opções
            </button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div className="sf-field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="sf-link-board">Quadro</label>
              <select
                id="sf-link-board"
                className="sf-select"
                value={boardId}
                onChange={(event) => setBoardId(event.target.value)}
                disabled={loading || busy}
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sf-field" style={{ flex: '2 1 260px' }}>
              <label htmlFor="sf-link-search">Buscar cartão</label>
              <input
                id="sf-link-search"
                className="sf-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, descrição ou etiqueta…"
                disabled={loading || busy}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <label className="sf-checkbox">
              <input
                type="checkbox"
                checked={onlyUnlinked}
                onChange={(event) => setOnlyUnlinked(event.target.checked)}
                disabled={busy}
              />
              Somente cartões sem vínculo SEI
            </label>
            <span className="sf-toolbar__spacer" />
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={selectAllVisible}
              disabled={loading || busy || visibleCards.length === 0}
            >
              Selecionar todos
            </button>
            <button
              type="button"
              className="sf-btn sf-btn--ghost sf-btn--sm"
              onClick={() => setSelected(new Set())}
              disabled={busy || selected.size === 0}
            >
              Limpar
            </button>
          </div>

          {error && <ErrorState message={error} />}
          {errors.length > 0 && (
            <ErrorState message={`${errors.length} cartão(ões) não puderam ser vinculados: ${errors.join(' · ')}`} />
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0' }}>
              <Spinner />
              <span className="sf-hint">Carregando cartões de {defaultBoard?.name ?? 'quadro'}…</span>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="sf-link-list__empty">
              Nenhum cartão encontrado com esses filtros.
              {onlyUnlinked && ' Tente desmarcar “Somente cartões sem vínculo SEI”.'}
            </div>
          ) : (
            <div className="sf-link-list" role="list">
              {visibleCards.map((card) => {
                const isSelected = selected.has(card.id);
                const due = formatDue(card.due, card.dueComplete);
                return (
                  <label
                    key={card.id}
                    className={classNames('sf-link-item', isSelected && 'sf-link-item--selected')}
                    role="listitem"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(card.id)}
                      disabled={busy}
                    />
                    <span className="sf-link-item__body">
                      <span className="sf-link-item__name">{card.name}</span>
                      <span className="sf-link-item__meta">
                        {card.labels.slice(0, 4).map((label) => (
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
                        {due && (
                          <span className={classNames('sf-chip', `sf-chip--${due.tone}`)}>
                            <Icon name="calendar" size={11} />
                            {due.label}
                          </span>
                        )}
                        <span>{locationLabel(card)}</span>
                        {card.links.length > 0 && (
                          <span className="sf-chip sf-chip--accent">
                            <Icon name="link" size={11} />
                            {card.links.length} vínculo(s)
                          </span>
                        )}
                      </span>
                      {card.description && (
                        <span className="sf-hint" style={{ display: 'block', marginTop: 3 }}>
                          {card.description.slice(0, 140)}
                          {card.description.length > 140 ? '…' : ''}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="sf-hint">
            Os vínculos são gravados na descrição do cartão como <code>SEI {processNumber}</code>. O
            conteúdo existente é preservado.
          </div>
        </div>
      )}
    </Modal>
  );
}
