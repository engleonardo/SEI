import type { TrelloCard } from '../core/domain/types';

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isOverdue(card: Pick<TrelloCard, 'due' | 'dueComplete'>): boolean {
  if (!card.due || card.dueComplete) return false;
  const due = startOfDay(new Date(card.due));
  const today = startOfDay(new Date());
  return due.getTime() < today.getTime();
}

export interface DueInfo {
  label: string;
  tone: 'neutral' | 'danger' | 'warning' | 'success';
}

export function formatDue(due: string | null, dueComplete = false): DueInfo | null {
  if (!due) return null;
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return null;

  const formatted = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (dueComplete) {
    return { label: `Concluído · ${formatted}`, tone: 'success' };
  }

  const dueDay = startOfDay(date);
  const today = startOfDay(new Date());
  const diff = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  if (diff < 0) {
    const days = Math.abs(diff);
    return { label: `Atrasado há ${days} ${days === 1 ? 'dia' : 'dias'}`, tone: 'danger' };
  }
  if (diff === 0) return { label: 'Vence hoje', tone: 'warning' };
  if (diff === 1) return { label: 'Vence amanhã', tone: 'warning' };
  return { label: formatted, tone: 'neutral' };
}

export function toDateInputValue(due: string | null): string {
  if (!due) return '';
  const date = new Date(due);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
}

const LABEL_COLORS: Record<string, string> = {
  green: '#61bd4f',
  yellow: '#f2d600',
  orange: '#ff9f1a',
  red: '#eb5a46',
  purple: '#c377e0',
  blue: '#0079bf',
  sky: '#00c2e0',
  lime: '#51e898',
  pink: '#ff80ce',
  black: '#344563',
};

const LIGHT_COLORS = new Set(['yellow', 'lime', 'sky']);

export const TRELLO_LABEL_COLORS = [
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'blue',
  'sky',
  'lime',
  'pink',
  'black',
] as const;

export function labelColorHex(color: string | null | undefined): string {
  if (!color) return '#b6c2cf';
  return LABEL_COLORS[color] ?? '#b6c2cf';
}

export function labelTextColor(color: string | null | undefined): string {
  return color && LIGHT_COLORS.has(color) ? '#172b4d' : '#ffffff';
}

export function locationKey(card: Pick<TrelloCard, 'idBoard' | 'idList'>): string {
  return `${card.idBoard}:${card.idList}`;
}

export function locationLabel(card: TrelloCard): string {
  const board = card.board?.name ?? 'Quadro';
  const list = card.list?.name ?? 'Lista';
  return `${board} » ${list}`;
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
