import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrelloCard } from '../../core/domain/types';
import { CardStack } from './CardStack';

const card: TrelloCard = {
  id: 'card-1',
  name: 'Cartão vinculado',
  desc: '',
  description: '',
  shortUrl: 'https://trello.com/c/1',
  due: null,
  dueComplete: false,
  idBoard: 'board-1',
  idList: 'list-1',
  idChecklists: [],
  labels: [],
  board: { id: 'board-1', name: 'Quadro' },
  list: { id: 'list-1', name: 'Lista' },
  links: ['08660.018176/2014-60'],
  hasChecklist: false,
};

const common = {
  processNumber: '08660.018176/2014-60',
  onReload: vi.fn(),
  onChanged: vi.fn(),
  onRemoved: vi.fn(),
  onAdded: vi.fn(),
};

describe('CardStack', () => {
  it('mostra estado vazio com atalhos', () => {
    render(<CardStack {...common} cards={[]} showHeader />);

    expect(screen.getByText('Nenhum cartão vinculado a este processo.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Novo cartão/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Vincular existente/i })).toBeInTheDocument();
  });

  it('renderiza todos os cartões', () => {
    render(<CardStack {...common} cards={[card, { ...card, id: 'card-2', name: 'Segundo cartão' }]} />);

    expect(screen.getByText('Cartão vinculado')).toBeInTheDocument();
    expect(screen.getByText('Segundo cartão')).toBeInTheDocument();
  });

  it('mostra erro com ação de tentar novamente', () => {
    render(<CardStack {...common} cards={[]} error="Falha ao carregar" />);

    expect(screen.getByText('Falha ao carregar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
  });
});
