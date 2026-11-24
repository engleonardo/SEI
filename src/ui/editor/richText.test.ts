import { describe, expect, it } from 'vitest';
import { editorHtmlToMarkdown, markdownToEditorHtml } from './richText';

describe('lista de tarefas no editor', () => {
  it('converte o checkbox do editor para markdown', () => {
    const markdown = editorHtmlToMarkdown('<ul><li><input type="checkbox"> item</li></ul>');
    expect(markdown).toContain('[ ]');
    expect(markdown).toContain('item');
  });

  it('mantém o checkbox clicável ao abrir uma lista de tarefas existente', () => {
    const html = markdownToEditorHtml('- [ ] item');
    expect(html).toContain('<input');
    expect(html).not.toContain('disabled');
  });
});
