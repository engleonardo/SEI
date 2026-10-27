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

/**
 * Paleta oficial de etiquetas do Trello (30 cores).
 * Os nomes com `_dark` e `_light` foram adicionados pelo Trello em 2022.
 * A API retorna exatamente esses nomes no campo `color`.
 */
const LABEL_COLORS: Record<string, string> = {
  green: '#4bce97',
  yellow: '#f5cd47',
  orange: '#fea362',
  red: '#f87168',
  purple: '#9f8fef',
  blue: '#579dff',
  sky: '#6cc3e0',
  lime: '#94c748',
  pink: '#e774bb',
  black: '#8590a2',
  green_dark: '#1f845a',
  yellow_dark: '#946f00',
  orange_dark: '#c25100',
  red_dark: '#c9372c',
  purple_dark: '#6e5dc6',
  blue_dark: '#0c66e4',
  sky_dark: '#227d9b',
  lime_dark: '#5b7f24',
  pink_dark: '#ae4787',
  black_dark: '#626f86',
  green_light: '#baf3db',
  yellow_light: '#f8e6a0',
  orange_light: '#fedec8',
  red_light: '#ffd5d2',
  purple_light: '#dfd8fd',
  blue_light: '#cce0ff',
  sky_light: '#c6edfb',
  lime_light: '#d3f1a7',
  pink_light: '#fdd0ec',
  black_light: '#dcdfe4',
};

export const TRELLO_LABEL_COLORS = [
  'green',
  'green_dark',
  'green_light',
  'yellow',
  'yellow_dark',
  'yellow_light',
  'orange',
  'orange_dark',
  'orange_light',
  'red',
  'red_dark',
  'red_light',
  'purple',
  'purple_dark',
  'purple_light',
  'blue',
  'blue_dark',
  'blue_light',
  'sky',
  'sky_dark',
  'sky_light',
  'lime',
  'lime_dark',
  'lime_light',
  'pink',
  'pink_dark',
  'pink_light',
  'black',
  'black_dark',
  'black_light',
] as const;

function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return 0;
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function labelColorHex(color: string | null | undefined): string {
  if (!color) return '#b6c2cf';
  if (color.startsWith('#')) return color;
  return LABEL_COLORS[color] ?? '#b6c2cf';
}

export function labelTextColor(color: string | null | undefined): string {
  return relativeLuminance(labelColorHex(color)) > 0.52 ? '#172b4d' : '#ffffff';
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
