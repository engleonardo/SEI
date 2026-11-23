import { browser } from 'wxt/browser';
import type {
  BulkLinkResult,
  TrelloAttachment,
  TrelloBoard,
  TrelloCard,
  TrelloChecklist,
  TrelloLabel,
  TrelloList,
} from '../domain/types';
import { addLink, parseLinks, removeLink, stripLinks } from '../link/marker';
import { TrelloError } from '../trello/client';
import type { MirrorGroup } from '../storage/mirrors';

/**
 * Dados de exemplo do "Modo sem Trello".
 *
 * Nada aqui fala com a API do Trello: os quadros, listas, etiquetas e cartões
 * ficam em `storage.local` e as edições são locais. Serve para experimentar a
 * extensão sem conectar uma conta.
 */

const DEMO_KEY = 'sei-flow:demo:v1';
const SEED_VERSION = 2;

interface DemoList extends TrelloList {
  boardId: string;
}

interface DemoLabel extends TrelloLabel {
  idBoard: string;
}

interface DemoData {
  version: number;
  boards: TrelloBoard[];
  lists: DemoList[];
  labels: DemoLabel[];
  cards: TrelloCard[];
}

let memory: DemoData | null = null;

function isoDay(offset: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString();
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function attach(data: DemoData, card: TrelloCard): TrelloCard {
  const list = data.lists.find((item) => item.id === card.idList) ?? null;
  const board = data.boards.find((item) => item.id === card.idBoard) ?? null;
  return {
    ...card,
    labels: [...card.labels],
    links: [...card.links],
    list: list ? { id: list.id, name: list.name, pos: list.pos } : null,
    board: board ? { id: board.id, name: board.name } : null,
  };
}

function makeCard(
  data: DemoData,
  input: {
    id?: string;
    name: string;
    idBoard: string;
    idList: string;
    description?: string;
    process?: string;
    labels?: string[];
    due?: string | null;
    start?: string | null;
    dueComplete?: boolean;
    hasChecklist?: boolean;
    attachmentCount?: number;
  },
): TrelloCard {
  const base = input.description ?? '';
  const desc = input.process ? addLink(base, input.process) : base;
  const board = data.boards.find((item) => item.id === input.idBoard) ?? data.boards[0]!;
  const list = data.lists.find((item) => item.id === input.idList) ?? data.lists[0]!;
  const labels = (input.labels ?? [])
    .map((id) => data.labels.find((label) => label.id === id))
    .filter((label): label is DemoLabel => Boolean(label))
    .map(({ idBoard: _idBoard, ...label }) => label);
  const card: TrelloCard = {
    id: input.id ?? newId('demo-card'),
    name: input.name,
    desc,
    description: stripLinks(desc),
    shortUrl: 'https://trello.com/',
    start: input.start ?? null,
    due: input.due ?? null,
    dueComplete: Boolean(input.dueComplete),
    idBoard: board.id,
    idList: list.id,
    idChecklists: input.hasChecklist ? ['demo-checklist-1'] : [],
    labels,
    board: { id: board.id, name: board.name },
    list: { id: list.id, name: list.name, pos: list.pos },
    links: parseLinks(desc),
    hasChecklist: Boolean(input.hasChecklist),
    attachmentCount: input.attachmentCount ?? 0,
    lastActivity: new Date().toISOString(),
  };
  return card;
}

function seed(): DemoData {
  const boards: TrelloBoard[] = [
    { id: 'demo-board-1', name: 'Meus processos' },
    { id: 'demo-board-2', name: 'Equipe' },
  ];
  const lists: DemoList[] = [
    { id: 'demo-list-1', name: 'A fazer', pos: 1, boardId: 'demo-board-1' },
    { id: 'demo-list-2', name: 'Em andamento', pos: 2, boardId: 'demo-board-1' },
    { id: 'demo-list-3', name: 'Aguardando', pos: 3, boardId: 'demo-board-1' },
    { id: 'demo-list-4', name: 'Concluído', pos: 4, boardId: 'demo-board-1' },
    { id: 'demo-list-5', name: 'A fazer', pos: 1, boardId: 'demo-board-2' },
    { id: 'demo-list-6', name: 'Em andamento', pos: 2, boardId: 'demo-board-2' },
    { id: 'demo-list-7', name: 'Concluído', pos: 3, boardId: 'demo-board-2' },
  ];
  const labels: DemoLabel[] = [
    { id: 'demo-label-urgent', name: 'Urgente', color: 'red', idBoard: 'demo-board-1' },
    { id: 'demo-label-judicial', name: 'Judicial', color: 'purple', idBoard: 'demo-board-1' },
    { id: 'demo-label-admin', name: 'Administrativo', color: 'blue', idBoard: 'demo-board-1' },
    { id: 'demo-label-wait', name: 'Aguardando', color: 'yellow', idBoard: 'demo-board-1' },
    { id: 'demo-label-team', name: 'Equipe', color: 'green', idBoard: 'demo-board-2' },
  ];
  const data: DemoData = { version: SEED_VERSION, boards, lists, labels, cards: [] };

  const samples: Array<Parameters<typeof makeCard>[1]> = [
    {
      name: 'Ofício 123/2026 - resposta ao cidadão',
      idBoard: 'demo-board-1',
      idList: 'demo-list-2',
      labels: ['demo-label-judicial', 'demo-label-urgent'],
      process: '12345.678901/2026-11',
      due: isoDay(2),
      hasChecklist: true,
      attachmentCount: 2,
      description:
        'Prazo para responder ao cidadão.\n\nConferir a manifestação da unidade antes de enviar.',
    },
    {
      name: 'Análise de contrato de prestação de serviços',
      idBoard: 'demo-board-1',
      idList: 'demo-list-2',
      labels: ['demo-label-admin'],
      process: '23456.789012/2026-10',
      due: isoDay(7),
      description: 'Conferir cláusulas de vigência, valores e fiscalização do contrato.',
    },
    {
      name: 'Aguardando manifestação da unidade',
      idBoard: 'demo-board-1',
      idList: 'demo-list-3',
      labels: ['demo-label-wait'],
      process: '34567.890123/2026-09',
      due: isoDay(10),
      description: 'Processo encaminhado para a unidade gestora.',
    },
    {
      name: 'Processo concluído - arquivamento',
      idBoard: 'demo-board-1',
      idList: 'demo-list-4',
      labels: ['demo-label-judicial'],
      process: '45678.901234/2026-08',
      due: isoDay(-3),
      dueComplete: true,
      description: 'Processo concluído e pronto para arquivamento.',
    },
    {
      name: 'Reunião de equipe - pauta',
      idBoard: 'demo-board-2',
      idList: 'demo-list-5',
      labels: ['demo-label-team'],
      due: isoDay(1),
      description: 'Pauta: prazos da semana, redistribuição e pendências.',
    },
    {
      name: 'Relatório mensal de atendimento',
      idBoard: 'demo-board-2',
      idList: 'demo-list-6',
      labels: ['demo-label-team'],
      due: isoDay(5),
      description: 'Consolidar os números do mês e enviar para a chefia.',
    },
    {
      name: 'Cartão de exemplo sem vínculo',
      idBoard: 'demo-board-1',
      idList: 'demo-list-1',
      labels: ['demo-label-urgent'],
      due: isoDay(3),
      description: 'Este cartão não tem processo vinculado; use para testar filtros e etiquetas.',
    },
  ];

  data.cards = samples.map((sample) => makeCard(data, sample));
  return data;
}

async function persist(data: DemoData): Promise<void> {
  memory = data;
  try {
    await browser.storage.local.set({ [DEMO_KEY]: data });
  } catch {
    // modo de demonstração é local; falha de quota não deve quebrar a UI
  }
}

export async function getDemoData(): Promise<DemoData> {
  if (memory) return memory;
  const stored = await browser.storage.local.get(DEMO_KEY).catch(() => null);
  const value = stored?.[DEMO_KEY] as DemoData | undefined;
  if (value && value.version === SEED_VERSION && Array.isArray(value.cards)) {
    memory = value;
    return value;
  }
  const fresh = seed();
  await persist(fresh);
  return fresh;
}

export async function resetDemoData(): Promise<void> {
  memory = null;
  await browser.storage.local.remove(DEMO_KEY).catch(() => undefined);
}

function requireCard(data: DemoData, cardId: string): TrelloCard {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) throw new TrelloError('not_found', 'Cartão de exemplo não encontrado.');
  return card;
}

export async function demoBoards(): Promise<TrelloBoard[]> {
  const data = await getDemoData();
  return [...data.boards];
}

export async function demoLists(boardId: string): Promise<TrelloList[]> {
  const data = await getDemoData();
  return data.lists
    .filter((list) => !boardId || list.boardId === boardId)
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
    .map(({ boardId: _boardId, ...list }) => list);
}

export async function demoBoardCards(boardId: string): Promise<TrelloCard[]> {
  const data = await getDemoData();
  return data.cards.filter((card) => card.idBoard === boardId).map((card) => attach(data, card));
}

export async function demoCard(cardId: string): Promise<TrelloCard> {
  const data = await getDemoData();
  return attach(data, requireCard(data, cardId));
}

export async function demoAllLinked(): Promise<TrelloCard[]> {
  const data = await getDemoData();
  return data.cards.filter((card) => card.links.length > 0).map((card) => attach(data, card));
}

export async function demoCardsForProcess(processNumber: string): Promise<TrelloCard[]> {
  const data = await getDemoData();
  const found = data.cards.filter((card) => card.links.includes(processNumber));
  if (found.length > 0) return found.map((card) => attach(data, card));

  const card = makeCard(data, {
    name: `Cartão de exemplo — ${processNumber}`,
    idBoard: 'demo-board-1',
    idList: 'demo-list-2',
    process: processNumber,
    labels: ['demo-label-admin'],
    due: isoDay(4),
    description: 'Cartão criado automaticamente no modo sem Trello para este processo.',
  });
  data.cards.unshift(card);
  await persist(data);
  return [attach(data, card)];
}

export async function demoBoardLabels(boardId: string): Promise<TrelloLabel[]> {
  const data = await getDemoData();
  return data.labels
    .filter((label) => label.idBoard === boardId)
    .map(({ idBoard: _idBoard, ...label }) => label);
}

export async function demoCreateCard(input: {
  name: string;
  description?: string;
  processNumber?: string;
  boardId?: string;
  listId?: string;
  start?: string | null;
  due?: string | null;
}): Promise<TrelloCard> {
  const data = await getDemoData();
  const list =
    data.lists.find((item) => item.id === input.listId) ??
    data.lists.find((item) => item.boardId === input.boardId) ??
    data.lists[0]!;
  const card = makeCard(data, {
    name: input.name,
    idBoard: list.boardId,
    idList: list.id,
    description: input.description,
    process: input.processNumber,
    start: input.start ?? null,
    due: input.due ?? null,
  });
  data.cards.unshift(card);
  await persist(data);
  return attach(data, card);
}

export async function demoUpdateCard(
  cardId: string,
  patch: {
    name?: string;
    description?: string;
    start?: string | null;
    due?: string | null;
    dueComplete?: boolean;
    idBoard?: string;
    idList?: string;
  },
): Promise<TrelloCard> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  if (patch.name !== undefined) card.name = patch.name.trim();
  if (patch.description !== undefined) {
    let desc = patch.description;
    for (const link of card.links) desc = addLink(desc, link);
    card.desc = desc;
    card.description = stripLinks(desc);
    card.links = parseLinks(desc);
  }
  if ('start' in patch) card.start = patch.start ?? null;
  if ('due' in patch) card.due = patch.due ?? null;
  if (patch.dueComplete !== undefined) card.dueComplete = patch.dueComplete;
  if (patch.idList) {
    const list = data.lists.find((item) => item.id === patch.idList);
    if (list) {
      card.idList = list.id;
      card.idBoard = list.boardId;
    }
  }
  if (patch.idBoard) card.idBoard = patch.idBoard;
  card.lastActivity = new Date().toISOString();
  await persist(data);
  return attach(data, card);
}

export async function demoDeleteCard(cardId: string): Promise<void> {
  const data = await getDemoData();
  data.cards = data.cards.filter((card) => card.id !== cardId);
  await persist(data);
}

export async function demoLinkCards(cardIds: string[], processNumber: string): Promise<BulkLinkResult[]> {
  const data = await getDemoData();
  const results: BulkLinkResult[] = [];
  for (const cardId of Array.from(new Set(cardIds.filter(Boolean)))) {
    const card = data.cards.find((item) => item.id === cardId);
    if (!card) {
      results.push({ cardId, status: 'error', message: 'Cartão não encontrado.' });
      continue;
    }
    if (card.links.includes(processNumber)) {
      results.push({ cardId, status: 'already', card: attach(data, card) });
      continue;
    }
    card.desc = addLink(card.desc, processNumber);
    card.description = stripLinks(card.desc);
    card.links = parseLinks(card.desc);
    results.push({ cardId, status: 'linked', card: attach(data, card) });
  }
  await persist(data);
  return results;
}

export async function demoLinkCardsBulk(cardIds: string[], processNumbers: string[]): Promise<BulkLinkResult[]> {
  return demoLinkCards(cardIds, processNumbers[0] ?? '');
}

export async function demoUnlinkCard(cardId: string, processNumber: string): Promise<TrelloCard> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  card.desc = removeLink(card.desc, processNumber);
  card.description = stripLinks(card.desc);
  card.links = parseLinks(card.desc);
  await persist(data);
  return attach(data, card);
}

export async function demoCreateBoard(name: string): Promise<TrelloBoard> {
  const data = await getDemoData();
  const board: TrelloBoard = { id: newId('demo-board'), name: name.trim() };
  data.boards.unshift(board);
  const defaults = ['A fazer', 'Em andamento', 'Concluído'];
  defaults.forEach((listName, index) => {
    data.lists.push({
      id: newId('demo-list'),
      name: listName,
      pos: index + 1,
      boardId: board.id,
    });
  });
  await persist(data);
  return board;
}

export async function demoRenameBoard(boardId: string, name: string): Promise<TrelloBoard> {
  const data = await getDemoData();
  const board = data.boards.find((item) => item.id === boardId);
  if (!board) throw new TrelloError('not_found', 'Quadro de exemplo não encontrado.');
  board.name = name.trim();
  await persist(data);
  return { ...board };
}

export async function demoCreateList(boardId: string, name: string): Promise<TrelloList> {
  const data = await getDemoData();
  const positions = data.lists.filter((list) => list.boardId === boardId).map((list) => list.pos ?? 0);
  const list: DemoList = {
    id: newId('demo-list'),
    name: name.trim(),
    pos: Math.max(0, ...positions) + 1,
    boardId,
  };
  data.lists.push(list);
  await persist(data);
  return { id: list.id, name: list.name, pos: list.pos };
}

export async function demoRenameList(boardId: string, listId: string, name: string): Promise<TrelloList> {
  const data = await getDemoData();
  const list = data.lists.find((item) => item.id === listId && (!boardId || item.boardId === boardId));
  if (!list) throw new TrelloError('not_found', 'Lista de exemplo não encontrada.');
  list.name = name.trim();
  await persist(data);
  return { id: list.id, name: list.name, pos: list.pos };
}

export async function demoUpdateList(listId: string, pos: number): Promise<TrelloList> {
  const data = await getDemoData();
  const list = data.lists.find((item) => item.id === listId);
  if (!list) throw new TrelloError('not_found', 'Lista de exemplo não encontrada.');
  list.pos = pos;
  await persist(data);
  return { id: list.id, name: list.name, pos: list.pos };
}

export async function demoCreateLabel(
  boardId: string,
  name: string,
  color: string,
): Promise<TrelloLabel> {
  const data = await getDemoData();
  const label: DemoLabel = { id: newId('demo-label'), name: name.trim(), color, idBoard: boardId };
  data.labels.push(label);
  await persist(data);
  return { id: label.id, name: label.name, color: label.color, idBoard: label.idBoard };
}

export async function demoAddLabel(cardId: string, labelId: string): Promise<TrelloCard> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  const label = data.labels.find((item) => item.id === labelId);
  if (label && !card.labels.some((item) => item.id === labelId)) {
    card.labels.push({
      id: label.id,
      name: label.name,
      color: label.color,
      idBoard: label.idBoard,
    });
  }
  await persist(data);
  return attach(data, card);
}

export async function demoRemoveLabel(cardId: string, labelId: string): Promise<TrelloCard> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  card.labels = card.labels.filter((label) => label.id !== labelId);
  await persist(data);
  return attach(data, card);
}

export async function demoCopyCard(cardId: string, listId: string): Promise<TrelloCard> {
  const data = await getDemoData();
  const source = requireCard(data, cardId);
  const list = data.lists.find((item) => item.id === listId) ?? data.lists.find((item) => item.id === source.idList);
  if (!list) throw new TrelloError('not_found', 'Lista de destino não encontrada.');
  const copy: TrelloCard = {
    ...source,
    id: newId('demo-card'),
    name: `${source.name} (cópia)`,
    idList: list.id,
    idBoard: list.boardId,
    labels: source.labels.map((label) => ({ ...label })),
    links: [...source.links],
    lastActivity: new Date().toISOString(),
  };
  data.cards.unshift(copy);
  await persist(data);
  return attach(data, copy);
}

export async function demoCopyBoard(boardId: string, name: string): Promise<TrelloBoard> {
  const data = await getDemoData();
  const board: TrelloBoard = { id: newId('demo-board'), name: name.trim() };
  data.boards.unshift(board);
  const lists = data.lists.filter((item) => item.boardId === boardId);
  const listMap = new Map<string, string>();
  for (const list of lists) {
    const id = newId('demo-list');
    listMap.set(list.id, id);
    data.lists.push({ id, name: list.name, pos: list.pos, boardId: board.id });
  }
  const cards = data.cards.filter((card) => card.idBoard === boardId);
  for (const card of cards) {
    data.cards.push({
      ...card,
      id: newId('demo-card'),
      idBoard: board.id,
      idList: listMap.get(card.idList) ?? card.idList,
      labels: card.labels.map((label) => ({ ...label })),
      links: [...card.links],
      lastActivity: new Date().toISOString(),
    });
  }
  await persist(data);
  return board;
}

export async function demoSearchCards(query: string): Promise<TrelloCard[]> {
  const term = query.trim().toLocaleLowerCase('pt-BR');
  if (!term) return [];
  const data = await getDemoData();
  return data.cards
    .filter(
      (card) =>
        card.name.toLocaleLowerCase('pt-BR').includes(term) ||
        card.description.toLocaleLowerCase('pt-BR').includes(term),
    )
    .map((card) => attach(data, card));
}

export async function demoAttachments(cardId: string): Promise<TrelloAttachment[]> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  if (!card.attachmentCount) return [];
  return [
    {
      id: `demo-attachment-${card.id}`,
      name: 'documento-exemplo.pdf',
      url: 'https://www.gov.br/',
      bytes: 128000,
      date: new Date().toISOString(),
      mimeType: 'application/pdf',
      isUpload: false,
    },
  ];
}

export async function demoAddAttachmentUrl(
  cardId: string,
  url: string,
  name?: string,
): Promise<TrelloAttachment> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  card.attachmentCount = (card.attachmentCount ?? 0) + 1;
  await persist(data);
  return {
    id: newId('demo-attachment'),
    name: name?.trim() || 'link',
    url,
    date: new Date().toISOString(),
    isUpload: false,
  };
}

export async function demoDeleteAttachment(cardId: string): Promise<void> {
  const data = await getDemoData();
  const card = data.cards.find((item) => item.id === cardId);
  if (card) {
    card.attachmentCount = Math.max(0, (card.attachmentCount ?? 0) - 1);
    await persist(data);
  }
}

export async function demoChecklists(cardId: string): Promise<TrelloChecklist[]> {
  const data = await getDemoData();
  const card = requireCard(data, cardId);
  if (!card.hasChecklist) return [];
  return [
    {
      id: 'demo-checklist-1',
      name: 'Checklist de exemplo',
      idCard: card.id,
      checkItems: [
        { id: 'demo-check-1', name: 'Conferir documento', state: 'incomplete', pos: 1 },
        { id: 'demo-check-2', name: 'Registrar andamento', state: 'complete', pos: 2 },
      ],
    },
  ];
}

export async function demoMirrorCard(
  cardId: string,
  listId: string,
): Promise<{ card: TrelloCard; group: MirrorGroup }> {
  const copy = await demoCopyCard(cardId, listId);
  return {
    card: copy,
    group: {
      id: newId('demo-mirror'),
      cardIds: [cardId, copy.id],
      createdAt: Date.now(),
    },
  };
}
