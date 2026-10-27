import { useStore } from '../store';
import { CardStack } from '../components/CardStack';
import { classNames } from '../utils';
import { addCards, listStore, loadList, removeCard, updateCard } from './store';

export function ProcessRowCards({
  processNumber,
  processUrl,
  compact = true,
  highlight = false,
}: {
  processNumber: string;
  processUrl?: string;
  compact?: boolean;
  highlight?: boolean;
}) {
  const state = useStore(listStore);
  const cards = state.cards.filter((card) => card.links.includes(processNumber));
  if (cards.length === 0) return null;

  return (
    <div className={classNames('sf-detail-strip', highlight && 'sf-detail-strip--highlight')}>
      <CardStack
        processNumber={processNumber}
        processUrl={processUrl}
        cards={cards}
        compact={compact}
        highlight={highlight}
        showHeader={false}
        onReload={() => void loadList()}
        onChanged={updateCard}
        onRemoved={removeCard}
        onAdded={addCards}
      />
    </div>
  );
}
