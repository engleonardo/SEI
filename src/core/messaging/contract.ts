import type {
  BulkLinkResult,
  CardPatch,
  ConnectionInfo,
  Settings,
  TrelloBoard,
  TrelloCard,
  TrelloChecklist,
  TrelloChecklistItem,
  TrelloLabel,
  TrelloList,
} from '../domain/types';
import type { LastActionTab } from '../storage/last-tab';
import type { ProcessRecord } from '../storage/processes';
import type { Rule } from '../domain/rules';

export interface RpcMap {
  'settings:get': { payload: undefined; result: Settings };
  'settings:save': { payload: Partial<Settings>; result: Settings };
  'settings:test-connection': { payload: undefined; result: ConnectionInfo };
  'settings:clear-cache': { payload: undefined; result: { cleared: true } };
  'options:open': { payload: undefined; result: undefined };
  'dashboard:open': { payload: undefined; result: undefined };
  'trello:boards': { payload: undefined; result: TrelloBoard[] };
  'trello:lists': { payload: { boardId: string }; result: TrelloList[] };
  'trello:board-cards': { payload: { boardId: string }; result: TrelloCard[] };
  'trello:card': { payload: { cardId: string }; result: TrelloCard };
  'trello:cards-for-process': { payload: { processNumber: string }; result: TrelloCard[] };
  'trello:all-linked-cards': { payload: undefined; result: TrelloCard[] };
  'trello:search-cards': { payload: { query: string }; result: TrelloCard[] };
  'trello:create-card': {
    payload: {
      name: string;
      description?: string;
      processNumber?: string;
      processUrl?: string;
      boardId?: string;
      listId?: string;
      start?: string | null;
      due?: string | null;
    };
    result: TrelloCard;
  };
  'trello:update-card': { payload: { cardId: string; patch: CardPatch }; result: TrelloCard };
  'trello:delete-card': { payload: { cardId: string }; result: undefined };
  'trello:link-cards': {
    payload: { cardIds: string[]; processNumber: string };
    result: BulkLinkResult[];
  };
  'trello:link-cards-bulk': {
    payload: { cardIds: string[]; processNumbers: string[] };
    result: BulkLinkResult[];
  };
  'trello:unlink-card': {
    payload: { cardId: string; processNumber: string };
    result: TrelloCard;
  };
  'trello:board-labels': { payload: { boardId: string; fresh?: boolean }; result: TrelloLabel[] };
  'trello:create-label': {
    payload: { boardId: string; name: string; color: string };
    result: TrelloLabel;
  };
  'trello:add-label': { payload: { cardId: string; labelId: string }; result: TrelloCard };
  'trello:remove-label': { payload: { cardId: string; labelId: string }; result: TrelloCard };
  'trello:checklists': { payload: { cardId: string }; result: TrelloChecklist[] };
  'trello:create-checklist': {
    payload: { cardId: string; name: string };
    result: TrelloChecklist[];
  };
  'trello:add-check-item': {
    payload: { checklistId: string; name: string };
    result: TrelloChecklistItem;
  };
  'trello:update-check-item': {
    payload: { cardId: string; checkItemId: string; state: 'complete' | 'incomplete' };
    result: undefined;
  };
  'trello:delete-check-item': {
    payload: { checklistId: string; checkItemId: string };
    result: undefined;
  };
  'trello:delete-checklist': { payload: { checklistId: string }; result: undefined };
  'activation:add-origin': { payload: { origin: string }; result: Settings };
  'activation:remove-origin': { payload: { origin: string }; result: Settings };
  'activation:set-all-sites': { payload: { enabled: boolean }; result: Settings };
  'activation:inject-tab': { payload: { tabId: number }; result: undefined };
  'activation:status': {
    payload: { url: string };
    result: { activated: boolean; allSites: boolean; origin: string | null };
  };
  'activation:last-tab': { payload: undefined; result: LastActionTab | null };
  'rules:list': { payload: undefined; result: Rule[] };
  'rules:save': { payload: { rules: Rule[] }; result: Rule[] };
  'rules:apply-now': { payload: { ruleId: string }; result: { applied: number; total: number } };
  'processes:list': { payload: undefined; result: ProcessRecord[] };
  'processes:upsert': {
    payload: { processes: Array<Partial<ProcessRecord> & { number: string }> };
    result: { updated: number; total: number };
  };
}

export type RpcType = keyof RpcMap;

export interface RpcRequest<T extends RpcType = RpcType> {
  rpc: T;
  payload: RpcMap[T]['payload'];
}

export type RpcSuccess<T> = { ok: true; data: T };
export type RpcFailure = { ok: false; error: { code: string; message: string } };
export type RpcResponse<T> = RpcSuccess<T> | RpcFailure;

export function isRpcRequest(value: unknown): value is RpcRequest {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'rpc' in value &&
      typeof (value as { rpc?: unknown }).rpc === 'string',
  );
}
