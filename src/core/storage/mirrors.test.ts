import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addMirror,
  getMirrorGroup,
  listMirrorGroups,
  removeMirrorCard,
  removeMirrorGroup,
} from './mirrors';

beforeEach(async () => {
  await browser.storage.local.clear();
});

describe('espelho de cartões', () => {
  it('cria, consulta e remove espelho', async () => {
    const group = await addMirror('card-1', 'card-2');
    expect(group.cardIds).toEqual(['card-1', 'card-2']);
    expect(await getMirrorGroup('card-2')).toMatchObject({ cardIds: ['card-1', 'card-2'] });

    await removeMirrorCard('card-2');
    expect(await listMirrorGroups()).toEqual([]);
  });

  it('junta grupos quando os cartões já estavam espelhados', async () => {
    await addMirror('card-1', 'card-2');
    await addMirror('card-3', 'card-4');
    const merged = await addMirror('card-1', 'card-3');
    expect(merged.cardIds.sort()).toEqual(['card-1', 'card-2', 'card-3', 'card-4']);
    expect(await listMirrorGroups()).toHaveLength(1);
  });

  it('remove o grupo inteiro', async () => {
    const group = await addMirror('card-1', 'card-2');
    await removeMirrorGroup(group.id);
    expect(await listMirrorGroups()).toEqual([]);
  });
});
