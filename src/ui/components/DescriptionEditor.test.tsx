import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DescriptionEditor } from './DescriptionEditor';

describe('DescriptionEditor', () => {
  it('abre com o conteúdo Markdown convertido para texto formatado', () => {
    render(<DescriptionEditor value={'**Negrito** e [link](https://trello.com)'} onChange={vi.fn()} />);

    const editor = screen.getByRole('textbox', { name: 'Descrição do cartão' });
    expect(editor.querySelector('strong')?.textContent).toBe('Negrito');
    expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://trello.com');
  });

  it('oferece barra de formatação', () => {
    render(<DescriptionEditor value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Negrito' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Itálico' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inserir link' })).toBeInTheDocument();
  });

  it('atualiza o conteúdo quando o valor externo muda', () => {
    const { rerender } = render(<DescriptionEditor value="**Um**" onChange={vi.fn()} />);
    rerender(<DescriptionEditor value="**Dois**" onChange={vi.fn()} />);
    const editor = screen.getByRole('textbox', { name: 'Descrição do cartão' });
    expect(editor.querySelector('strong')?.textContent).toBe('Dois');
  });
});
