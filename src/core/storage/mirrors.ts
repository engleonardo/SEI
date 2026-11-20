import { browser } from 'wxt/browser';

const MIRRORS_KEY = 'sei-flow:card-mirrors:v1';

export interface MirrorGroup {
  id: string;
  cardIds: string[];
  createdAt: number;
}

function newGroupId(): string {
  return `mirror_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(value: unknown): MirrorGroup | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const cardIds = Array.isArray(raw.cardIds)
    ? Array.from(new Set(raw.cardIds.filter((id): id is string => typeof id === 'string' && Boolean(id))))
    : [];
  if (cardIds.length < 2) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newGroupId(),
    cardIds,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

export async function listMirrorGroups(): Promise<MirrorGroup[]> {
  try {
    const stored = await browser.storage.local.get(MIRRORS_KEY);
    const value = stored[MIRRORS_KEY];
    if (!Array.isArray(value)) return [];
    return value.map(sanitize).filter((group): group is MirrorGroup => Boolean(group));
  } catch {
    return [];
  }
}

async function save(groups: MirrorGroup[]): Promise<void> {
  await browser.storage.local.set({ [MIRRORS_KEY]: groups });
}

export async function getMirrorGroup(cardId: string): Promise<MirrorGroup | null> {
  const groups = await listMirrorGroups();
  return groups.find((group) => group.cardIds.includes(cardId)) ?? null;
}

export async function addMirror(sourceCardId: string, targetCardId: string): Promise<MirrorGroup> {
  if (!sourceCardId || !targetCardId || sourceCardId === targetCardId) {
    throw new Error('Cartões inválidos para espelhar.');
  }
  const groups = await listMirrorGroups();
  const source = groups.find((group) => group.cardIds.includes(sourceCardId));
  const target = groups.find((group) => group.cardIds.includes(targetCardId));

  if (source && target && source.id !== target.id) {
    // Junta os dois grupos em um só.
    const merged: MirrorGroup = {
      ...source,
      cardIds: Array.from(new Set([...source.cardIds, ...target.cardIds])),
    };
    const next = groups
      .filter((group) => group.id !== target.id)
      .map((group) => (group.id === source.id ? merged : group));
    await save(next);
    return merged;
  }

  if (source) {
    if (!source.cardIds.includes(targetCardId)) {
      const next = groups.map((group) =>
        group.id === source.id
          ? { ...group, cardIds: [...group.cardIds, targetCardId] }
          : group,
      );
      await save(next);
      return next.find((group) => group.id === source.id) as MirrorGroup;
    }
    return source;
  }

  if (target) {
    const next = groups.map((group) =>
      group.id === target.id
        ? { ...group, cardIds: [...group.cardIds, sourceCardId] }
        : group,
    );
    await save(next);
    return next.find((group) => group.id === target.id) as MirrorGroup;
  }

  const created: MirrorGroup = {
    id: newGroupId(),
    cardIds: [sourceCardId, targetCardId],
    createdAt: Date.now(),
  };
  await save([...groups, created]);
  return created;
}

export async function removeMirrorCard(cardId: string): Promise<void> {
  const groups = await listMirrorGroups();
  const next = groups
    .map((group) => ({
      ...group,
      cardIds: group.cardIds.filter((id) => id !== cardId),
    }))
    .filter((group) => group.cardIds.length >= 2);
  await save(next);
}

export async function removeMirrorGroup(groupId: string): Promise<void> {
  const groups = await listMirrorGroups();
  await save(groups.filter((group) => group.id !== groupId));
}

export async function clearMirrors(): Promise<void> {
  await browser.storage.local.remove(MIRRORS_KEY);
}

