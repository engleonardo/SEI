import { describe, expect, it } from 'vitest';
import { editorHtmlToMarkdown, markdownToEditorHtml } from './richText';

describe('editor de descrição', () => {
  it('converte Markdown em HTML seguro', () => {
    const html = markdownToEditorHtml('**Negrito** e [link](https://trello.com)');
    expect(html).toContain('<strong>Negrito</strong>');
    expect(html).toContain('href="https://trello.com"');
  });

  it('converte HTML do editor de volta para Markdown', () => {
    const markdown = editorHtmlToMarkdown(
      '<p><strong>Negrito</strong> e <a href="https://trello.com">link</a></p><ul><li>Item</li></ul>',
    );
    expect(markdown).toContain('**Negrito**');
    expect(markdown).toContain('[link](https://trello.com)');
    expect(markdown).toContain('- Item');
  });

  it('remove script e links perigosos', () => {
    const html = markdownToEditorHtml(
      '<script>alert(1)</script><a href="javascript:alert(1)">perigo</a>',
    );
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html.toLowerCase()).not.toContain('javascript:');
  });

  it('preserva tachado e citação', () => {
    const markdown = editorHtmlToMarkdown(
      '<p><s>feito</s></p><blockquote><p>nota</p></blockquote>',
    );
    expect(markdown).toContain('~~feito~~');
    expect(markdown).toContain('> nota');
  });

  it('mantém imagens, tabelas e listas de tarefas ao editar', () => {
    const original = [
      '![logo](https://trello.com/logo.png)',
      '',
      '| Item | Prazo |',
      '| --- | --- |',
      '| Um | Hoje |',
      '',
      '- [x] feito',
      '- [ ] pendente',
    ].join('\n');

    const html = markdownToEditorHtml(original);
    expect(html).toContain('<img');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');

    const markdown = editorHtmlToMarkdown(html);
    expect(markdown).toContain('![logo](https://trello.com/logo.png)');
    expect(markdown).toContain('| Item | Prazo |');
    expect(markdown).toContain('| Um | Hoje |');
    expect(markdown).toContain('- [x] feito');
    expect(markdown).toContain('- [ ] pendente');
  });
});
