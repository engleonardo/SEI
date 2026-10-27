import { useCallback, useEffect, useState } from 'react';
import type { TrelloCard } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import { openOptionsPage } from '../../core/messaging/actions';
import { Icon } from '../icons';
import { locationLabel } from '../utils';
import { CardStack } from '../components/CardStack';

function mergeCards(current: TrelloCard[], incoming: TrelloCard[]): TrelloCard[] {
  const map = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) map.set(card.id, card);
  return Array.from(map.values());
}

export function ProcessPanel({
  processNumber,
  processUrl,
}: {
  processNumber: string;
  processUrl?: string;
}) {
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const value = await callRpc('trello:cards-for-process', { processNumber, fresh: true });
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
    setCards((previous) => mergeCards(previous, newCards).filter((card) => card.links.includes(processNumber)));
  };

  const first = cards[0];
  const sameLocation =
    !first ||
    cards.every((card) => card.idBoard === first.idBoard && card.idList === first.idList);
  const locationSummary = first
    ? sameLocation
      ? locationLabel(first)
      : 'Vários destinos'
    : null;

  return (
    <div className="sf-process-panel">
      <CardStack
        processNumber={processNumber}
        processUrl={processUrl}
        cards={cards}
        loading={loading}
        error={error}
        headerSummary={
          locationSummary ? (
            <span className="sf-stack__summary">
              <Icon name="board" size={13} />
              {locationSummary}
            </span>
          ) : undefined
        }
        showProcessMeta={false}
        showLocation={false}
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
