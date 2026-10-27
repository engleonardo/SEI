import type { TrelloBoard, TrelloCard, TrelloCardApi, TrelloList } from '../domain/types';
import { parseLinks, stripLinks } from '../link/marker';

export function toCard(
  raw: TrelloCardApi,
  boardFallback?: TrelloBoard | null,
  listFallback?: TrelloList | null,
): TrelloCard {
  const board = raw.board ?? boardFallback ?? null;
  const list = raw.list ?? listFallback ?? null;
  const links = parseLinks(raw.desc);

  return {
    id: raw.id,
    name: raw.name ?? '',
    desc: raw.desc ?? '',
    description: stripLinks(raw.desc),
    shortUrl: raw.shortUrl ?? `https://trello.com/c/${raw.id}`,
    due: raw.due ?? null,
    dueComplete: Boolean(raw.dueComplete),
    idBoard: raw.idBoard ?? board?.id ?? '',
    idList: raw.idList ?? list?.id ?? '',
    idChecklists: Array.isArray(raw.idChecklists) ? raw.idChecklists : [],
    labels: Array.isArray(raw.labels)
      ? raw.labels.filter((label) => Boolean(label?.id)).map((label) => ({
          id: label.id,
          name: label.name ?? '',
          color: label.color ?? null,
          idBoard: label.idBoard,
        }))
      : [],
    board: board ? { id: board.id, name: board.name } : null,
    list: list ? { id: list.id, name: list.name } : null,
    links,
    hasChecklist: Array.isArray(raw.idChecklists) && raw.idChecklists.length > 0,
  };
}

export function toCards(
  rawCards: TrelloCardApi[],
  board?: TrelloBoard | null,
  lists?: TrelloList[] | null,
): TrelloCard[] {
  const listById = new Map((lists ?? []).map((list) => [list.id, list]));
  return rawCards.map((raw) => toCard(raw, board, raw.idList ? listById.get(raw.idList) : undefined));
}
