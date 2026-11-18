import { useCallback, useEffect, useState } from 'react';
import { getPinnedCards, toggleCardPinned, watchPinnedCards } from '../../core/storage/pins';

export function usePinnedCards() {
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    void getPinnedCards().then((ids) => {
      if (active) setPinned(new Set(ids));
    });
    const unwatch = watchPinnedCards((ids) => {
      if (active) setPinned(new Set(ids));
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  const togglePin = useCallback(async (cardId: string) => {
    const ids = await toggleCardPinned(cardId);
    setPinned(new Set(ids));
  }, []);

  return { pinned, togglePin };
}
