import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrelloCard } from '../../core/domain/types';
import { KanbanBoard } from './KanbanBoard';
import type { CardGroup } from './model';

const card = (id: string, name: string, idList: string): TrelloCard => ({
  id,
  name,
  desc: '',
  description: '',
  shortUrl: `https://trello.com/c/${id}`,
  start: null,
  due: null,
  dueComplete: false,
  idBoard: 'board-1',
  idList,
  idChecklists: [],
  labels: [],
  board: { id: 'board-1', name: 'DEMANDAS' },
  list: { id: idList, name: idList === 'list-a' ? 'Aguardando' : 'Demandas' },
  links: [],
  hasChecklist: false,
  lastActivity: null,
});

const groups: CardGroup[] = [
  {
    key: 'board-1:list-a',
    title: 'Aguardando',
    subtitle: 'DEMANDAS',
    cards: [card('card-1', 'Cartão A', 'list-a')],
  },
  {
    key: 'board-1:list-b',
    title: 'Demandas',
    subtitle: 'DEMANDAS',
    cards: [card('card-2', 'Cartão B', 'list-b')],
  },
];

const common = {
  catalog: {},
  pinned: new Set<string>(),
  onChanged: vi.fn(),
  onRemoved: vi.fn(),
  onToggleLabel: vi.fn(),
  onProcessesRead: vi.fn(),
  onTogglePin: vi.fn(),
  onMoveCard: vi.fn(),
  onMoveColumn: vi.fn(),
  canMoveColumns: true,
};

describe('KanbanBoard', () => {
  it('mostra uma coluna por lista e os cartões', () => {
    render(<KanbanBoard groups={groups} {...common} />);

    expect(screen.getByRole('region', { name: 'Coluna Aguardando' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Coluna Demandas' })).toBeInTheDocument();
    expect(screen.getByText('Cartão A')).toBeInTheDocument();
    expect(screen.getByText('Cartão B')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Mover cartão Cartão A/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mover coluna Aguardando para a direita' }),
    ).toBeInTheDocument();
  });
});
