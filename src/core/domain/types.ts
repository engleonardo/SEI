export type TrelloColor =
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'blue'
  | 'sky'
  | 'lime'
  | 'pink'
  | 'black'
  | 'null';

export interface TrelloLabel {
  id: string;
  name: string;
  color: string | null;
  idBoard?: string;
}

export interface TrelloBoard {
  id: string;
  name: string;
}

export interface TrelloList {
  id: string;
  name: string;
  pos?: number;
}

export interface TrelloChecklistItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos?: number;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  checkItems: TrelloChecklistItem[];
}

export interface TrelloCardApi {
  id: string;
  name: string;
  desc: string;
  shortUrl?: string;
  due?: string | null;
  dueComplete?: boolean;
  idBoard?: string;
  idList?: string;
  idChecklists?: string[];
  labels?: TrelloLabel[];
  dateLastActivity?: string | null;
  board?: { id: string; name: string } | null;
  list?: { id: string; name: string } | null;
  closed?: boolean;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  description: string;
  shortUrl: string;
  due: string | null;
  dueComplete: boolean;
  idBoard: string;
  idList: string;
  idChecklists: string[];
  labels: TrelloLabel[];
  board: TrelloBoard | null;
  list: TrelloList | null;
  links: string[];
  hasChecklist: boolean;
  lastActivity: string | null;
}

export interface CardPatch {
  name?: string;
  description?: string;
  due?: string | null;
  dueComplete?: boolean;
  idBoard?: string;
  idList?: string;
}

export interface BulkLinkResult {
  cardId: string;
  status: 'linked' | 'already' | 'error';
  message?: string;
  card?: TrelloCard;
}

export type ThemePreference = 'auto' | 'light' | 'dark';

export interface Settings {
  appKey: string;
  appToken: string;
  defaultBoardId: string;
  defaultBoardName: string;
  defaultListId: string;
  defaultListName: string;
  activatedOrigins: string[];
  allSites: boolean;
  theme: ThemePreference;
  compact: boolean;
  notificationsEnabled: boolean;
  autoRefreshMinutes: number;
}

export interface ConnectionInfo {
  id: string;
  username: string;
  fullName: string;
  boardCount: number;
}

export type SeiPageKind = 'process-list' | 'process-content' | 'unknown';

export interface SeiProcessRow {
  row: HTMLTableRowElement;
  anchor: HTMLAnchorElement;
  processNumber: string;
  specification: string;
  processType: string;
  url: string;
  origin: string;
  highlight: boolean;
}
