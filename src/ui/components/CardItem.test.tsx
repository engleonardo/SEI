import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TrelloCard } from '../../core/domain/types';
import { CardItem } from './CardItem';

const card: TrelloCard = {
  id: 'card-1',
  name: 'Revisar contrato',
  desc: '',
  description: 'Conferir cláusulas e anexos.',
  shortUrl: 'https://trello.com/c/1',
  due: null,
  dueComplete: false,
  idBoard: 'board-1',
  idList: 'list-1',
  idChecklists: [],
  labels: [
    { id: 'label-1', name: 'Urgente', color: 'red' },
    { id: 'label-2', name: 'Jurídico', color: 'blue' },
  ],
  board: { id: 'board-1', name: 'Contratos' },
  list: { id: 'list-1', name: 'Em análise' },
  links: ['08660.018176/2014-60'],
  hasChecklist: false,
};

describe('CardItem', () => {
  it('mostra nome, descrição, etiquetas e localização', () => {
    render(
      <CardItem
        card={card}
        processNumber="08660.018176/2014-60"
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByText('Revisar contrato')).toBeInTheDocument();
    expect(screen.getByText('Conferir cláusulas e anexos.')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Jurídico')).toBeInTheDocument();
    expect(screen.getByText('Contratos » Em análise')).toBeInTheDocument();
  });

  it('expõe as ações principais por acessibilidade', () => {
    render(
      <CardItem
        card={card}
        processNumber="08660.018176/2014-60"
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Atualizar cartão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desvincular deste processo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir cartão' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir no Trello' })).toHaveAttribute(
      'href',
      'https://trello.com/c/1',
    );
  });

  it('inicia a edição do nome ao clicar no título', async () => {
    const user = userEvent.setup();
    render(
      <CardItem
        card={card}
        processNumber="08660.018176/2014-60"
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Editar nome' }));
    expect(screen.getByLabelText('Nome do cartão')).toHaveValue('Revisar contrato');
  });

  it('mostra o atalho de descrição quando está vazia', () => {
    render(
      <CardItem
        card={{ ...card, description: '' }}
        processNumber="08660.018176/2014-60"
        onChanged={vi.fn()}
        onRemoved={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Adicionar descrição/i })).toBeInTheDocument();
  });
});
