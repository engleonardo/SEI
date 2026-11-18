import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CardDescription } from './CardDescription';

describe('CardDescription', () => {
  it('renderiza negrito e link seguro', () => {
    render(<CardDescription text={'**Negrito** e [Trello](https://trello.com)'} />);

    expect(screen.getByText('Negrito').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'Trello' });
    expect(link).toHaveAttribute('href', 'https://trello.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('não executa HTML bruto', () => {
    render(<CardDescription text={'<script>alert(1)</script>'} />);
    expect(document.querySelector('script')).toBeNull();
  });

  it('transforma URL solta em link', () => {
    render(<CardDescription text={'Veja https://trello.com/b/abc'} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://trello.com/b/abc');
  });
});
