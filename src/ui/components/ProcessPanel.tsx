import { useCallback, useEffect, useState } from 'react';
import type { TrelloCard, TrelloLabel } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import { Icon } from '../icons';
import { labelColorHex, labelTextColor } from '../utils';
import { CardStack } from '../components/CardStack';

function mergeCards(current: TrelloCard[], incoming: TrelloCard[]): TrelloCard[] {
  const map = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) map.set(card.id, card);
  return Array.from(map.values());
}

export function ProcessPanel({
  processNumber,
}: {
  processNumber: string;
}) {
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [labelFilter, setLabelFilter] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const value = await callRpc('trello:cards-for-process', {
        processNumber,
        fresh: true,
      });
      setCards(value);
    } catch (cause) {
      setError(errorMessage(cause));
      setNeedsSetup(errorCode(cause) === 'not_configured');
    } finally {
      setLoading(false);
    }
  }, [processNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const onChanged = (card: TrelloCard) => {
    setCards((previous) => {
      if (!card.links.includes(processNumber)) {
        return previous.filter((item) => item.id !== card.id);
      }
      return previous.some((item) => item.id === card.id)
        ? previous.map((item) => (item.id === card.id ? card : item))
        : [...previous, card];
    });
  };

  const onRemoved = (cardId: string) => {
    setCards((previous) => previous.filter((card) => card.id !== cardId));
  };

  const onAdded = (newCards: TrelloCard[]) => {
    setCards((previous) =>
      mergeCards(previous, newCards).filter((card) => card.links.includes(processNumber)),
    );
  };

  const toggleLabel = (labelId: string) => {
    setLabelFilter((previous) =>
      previous.includes(labelId)
        ? previous.filter((id) => id !== labelId)
        : [...previous, labelId],
    );
  };

  const visibleCards =
    labelFilter.length === 0
      ? cards
      : cards.filter((card) => card.labels.some((label) => labelFilter.includes(label.id)));

  const filterLabels: TrelloLabel[] = [];
  for (const card of cards) {
    for (const label of card.labels) {
      if (labelFilter.includes(label.id) && !filterLabels.some((item) => item.id === label.id)) {
        filterLabels.push(label);
      }
    }
  }

  return (
    <div className="sf-process-panel">
      {labelFilter.length > 0 && (
        <div className="sf-label-filter">
          <span className="sf-label-filter__label">Filtrando</span>
          {filterLabels.map((label) => (
            <button
              key={label.id}
              type="button"
              className="sf-label-chip sf-label-chip--button"
              style={{
                backgroundColor: labelColorHex(label.color),
                color: labelTextColor(label.color),
              }}
              onClick={() => toggleLabel(label.id)}
              title="Remover este filtro"
            >
              {label.name || label.color || 'Etiqueta'}
              <Icon name="close" size={10} />
            </button>
          ))}
          <button
            type="button"
            className="sf-btn sf-btn--sm"
            onClick={() => setLabelFilter([])}
          >
            Limpar
          </button>
        </div>
      )}

      <CardStack
        processNumber={processNumber}
        cards={visibleCards}
        loading={loading}
        error={error}
        showProcessMeta={false}
        compact
        activeLabels={labelFilter}
        onToggleLabel={toggleLabel}
        emptyMessage={
          labelFilter.length > 0 && cards.length > 0
            ? 'Nenhum cartão com as etiquetas selecionadas.'
            : undefined
        }
        errorExtra={
          needsSetup ? (
            <button
              type="button"
              className="sf-btn sf-btn--sm"
              onClick={() => void openOptionsPage()}
            >
              <Icon name="settings" size={13} />
              Abrir opções
            </button>
          ) : undefined
        }
        showHeader
        onReload={() => void load()}
        onChanged={onChanged}
        onRemoved={onRemoved}
        onAdded={onAdded}
      />
    </div>
  );
}
