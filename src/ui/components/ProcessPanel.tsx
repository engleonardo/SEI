import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import type { TrelloCard } from '../../core/domain/types';
import { callRpc, errorCode, errorMessage } from '../../core/messaging/client';
import { Icon } from '../icons';
import { CardStack } from '../components/CardStack';

function mergeCards(current: TrelloCard[], incoming: TrelloCard[]): TrelloCard[] {
  const map = new Map(current.map((card) => [card.id, card]));
  for (const card of incoming) map.set(card.id, card);
  return Array.from(map.values());
}

export function ProcessPanel({ processNumber }: { processNumber: string }) {
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsSetup(false);
    try {
      const value = await callRpc('trello:cards-for-process', { processNumber });
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

  return (
    <div className="sf-process-panel">
      <CardStack
        processNumber={processNumber}
        cards={cards}
        loading={loading}
        error={error}
        errorExtra={
          needsSetup ? (
            <button
              type="button"
              className="sf-btn sf-btn--sm"
              onClick={() => void browser.runtime.openOptionsPage()}
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
