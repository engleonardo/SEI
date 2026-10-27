import { useStore } from '../store';
import { CardStack } from '../components/CardStack';
import { addCards, listStore, loadList, removeCard, updateCard } from './store';

export function ProcessRowCards({
  processNumber,
  compact = true,
}: {
  processNumber: string;
  compact?: boolean;
}) {
  const state = useStore(listStore);
  const cards = state.cards.filter((card) => card.links.includes(processNumber));
  if (cards.length === 0) return null;

  return (
    <CardStack
      processNumber={processNumber}
      cards={cards}
      compact={compact}
      showHeader={false}
      onReload={() => void loadList()}
      onChanged={updateCard}
      onRemoved={removeCard}
      onAdded={addCards}
    />
  );
}
