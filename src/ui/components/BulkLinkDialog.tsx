import { useEffect, useMemo, useState } from 'react';
import type { TrelloBoard, TrelloCard, TrelloList } from '../../core/domain/types';
import { parseProcessNumbers } from '../../core/domain/process';
import { callRpc, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { showToast } from '../toast';
import { classNames, formatDue, labelColorHex, labelTextColor, locationLabel } from '../utils';
import { ErrorState, Spinner } from './common';
import { Modal } from './Modal';

export interface BulkLinkDialogProps {
  onClose: () => void;
  onDone?: () => void;
}

export function BulkLinkDialog({ onClose, onDone }: BulkLinkDialogProps) {
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [boardId, setBoardId] = useState('');
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [listId, setListId] = useState('');
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [search, setSearch] = useState('');
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [processInput, setProcessInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([callRpc('settings:get', undefined), callRpc('trello:boards', undefined)])
      .then(([settings, nextBoards]) => {
        if (!active) return;
        setBoards(nextBoards);
        const preferred =
          nextBoards.find((board) => board.id === settings.defaultBoardId) ?? nextBoards[0];
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
    setListId('');
    setLoading(true);
    setError(null);
    setSelected(new Set());
    Promise.all([
      callRpc('trello:lists', { boardId }),
      callRpc('trello:board-cards', { boardId }),
    ])
      .then(([nextLists, nextCards]) => {
        if (!active) return;
        setLists(nextLists);
        setCards(nextCards);
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

  const processes = useMemo(() => parseProcessNumbers(processInput), [processInput]);

  const visibleCards = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (listId && card.idList !== listId) return false;
      if (onlyUnlinked && card.links.length > 0) return false;
      if (!needle) return true;
      const haystack = [card.name, card.description, ...card.labels.map((label) => label.name)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [cards, listId, onlyUnlinked, search]);

  const toggle = (cardId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const link = async () => {
    if (selected.size === 0 || processes.length === 0) return;
    setBusy(true);
    setErrors([]);
    try {
      const results = await callRpc('trello:link-cards-bulk', {
        cardIds: Array.from(selected),
        processNumbers: processes,
      });
      const failures = results.filter((result) => result.status === 'error');
      const linked = results.filter((result) => result.status === 'linked').length;
      const already = results.filter((result) => result.status === 'already').length;

      if (failures.length > 0) {
        setErrors(failures.map((failure) => failure.message ?? `Falha no cartão ${failure.cardId}`));
        setSelected(new Set(failures.map((failure) => failure.cardId)));
        showToast(
          `${linked} cartão(ões) atualizado(s); ${failures.length} com erro.`,
          'error',
          7000,
        );
      } else {
        showToast(
          `${linked} cartão(ões) vinculado(s) a ${processes.length} processo(s)${
            already > 0 ? `; ${already} já estavam vinculados` : ''
          }.`,
          'success',
        );
        onDone?.();
        onClose();
      }
    } catch (cause) {
      const message = errorMessage(cause);
      setErrors([message]);
      showToast(message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Vincular cartões a vários processos"
      subtitle="Ação em lote: selecione cartões do Trello e informe os processos de destino."
      onClose={onClose}
      footer={
        <>
          <span className="sf-modal__footer-left">
            {selected.size} cartão(ões) · {processes.length} processo(s)
          </span>
          <button type="button" className="sf-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="sf-btn sf-btn--primary"
            onClick={() => void link()}
            disabled={busy || selected.size === 0 || processes.length === 0}
          >
            {busy ? <Spinner /> : <Icon name="link" size={14} />}
            Vincular em lote
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <div className="sf-field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="sf-bulk-board">Quadro</label>
            <select
              id="sf-bulk-board"
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
          <div className="sf-field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="sf-bulk-list">Lista (opcional)</label>
            <select
              id="sf-bulk-list"
              className="sf-select"
              value={listId}
              onChange={(event) => setListId(event.target.value)}
              disabled={loading || busy}
            >
              <option value="">Todas as listas</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sf-field" style={{ flex: '2 1 240px' }}>
            <label htmlFor="sf-bulk-search">Buscar cartão</label>
            <input
              id="sf-bulk-search"
              className="sf-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, descrição ou etiqueta…"
              disabled={loading || busy}
            />
          </div>
        </div>

        <label className="sf-checkbox">
          <input
            type="checkbox"
            checked={onlyUnlinked}
            onChange={(event) => setOnlyUnlinked(event.target.checked)}
            disabled={busy}
          />
          Somente cartões sem vínculo SEI
        </label>

        {error && <ErrorState message={error} />}
        {errors.length > 0 && (
          <ErrorState
            message={`${errors.length} cartão(ões) não puderam ser vinculados: ${errors.join(' · ')}`}
          />
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
            <Spinner />
            <span className="sf-hint">Carregando cartões…</span>
          </div>
        ) : visibleCards.length === 0 ? (
          <div className="sf-link-list__empty">Nenhum cartão encontrado com esses filtros.</div>
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
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="sf-field">
          <label htmlFor="sf-bulk-processes">Processos de destino</label>
          <textarea
            id="sf-bulk-processes"
            className="sf-textarea"
            value={processInput}
            onChange={(event) => setProcessInput(event.target.value)}
            placeholder={'Um por linha ou separados por vírgula. Ex.:\n08660.018176/2014-60\n12345.678901/2025-12'}
            disabled={busy}
          />
          <span className="sf-hint">
            {processes.length > 0
              ? `${processes.length} processo(s) válido(s) reconhecido(s).`
              : 'Nenhum número de processo válido reconhecido ainda.'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
