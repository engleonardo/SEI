import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
  await browser.storage.local.clear();
  vi.resetModules();
});

describe('favoritos/fixados', () => {
  it('fixa, lista e desafixa cartões', async () => {
    const { getPinnedCards, isCardPinned, toggleCardPinned } = await import('./pins');

    expect(await getPinnedCards()).toEqual([]);
    await toggleCardPinned('card-1');
    expect(await getPinnedCards()).toEqual(['card-1']);
    expect(await isCardPinned('card-1')).toBe(true);

    await toggleCardPinned('card-1');
    expect(await getPinnedCards()).toEqual([]);
    expect(await isCardPinned('card-1')).toBe(false);
  });

  it('deduplica e persiste a lista', async () => {
    const { getPinnedCards, setCardPinned } = await import('./pins');

    await setCardPinned('card-1', true);
    await setCardPinned('card-1', true);
    await setCardPinned('card-2', true);
    expect(await getPinnedCards()).toEqual(['card-1', 'card-2']);
  });
});
