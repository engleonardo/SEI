import DOMPurify from 'dompurify';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'del',
  's',
  'strike',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'hr',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'input',
];

const ALLOWED_ATTRIBUTES = [
  'href',
  'title',
  'target',
  'rel',
  'src',
  'alt',
  'colspan',
  'rowspan',
  'type',
  'checked',
  'disabled',
];

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  hr: '---',
});

turndown.use(gfm);

turndown.addRule('strikethrough', {
  filter: (node) =>
    node.nodeName === 'DEL' || node.nodeName === 'S' || node.nodeName === 'STRIKE',
  replacement: (content) => `~~${content}~~`,
});

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
  });
}

/** Markdown do Trello -> HTML seguro para o editor WYSIWYG. */
export function markdownToEditorHtml(markdown: string): string {
  const html = marked.parse(markdown ?? '', {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;
  // No editor, os checkboxes de lista de tarefas precisam ser clicáveis.
  return sanitizeHtml(html).replace(/<input([^>]*?) disabled(?:="[^"]*")?([^>]*?)>/gi, '<input$1$2>');
}

/** HTML do editor -> Markdown aceito pelo Trello. */
export function editorHtmlToMarkdown(html: string): string {
  const safe = sanitizeHtml(html);
  const markdown = turndown.turndown(safe);
  return markdown
    .replace(/\u00a0/g, ' ')
    .replace(/^(\s*[-*+])\s{2,}/gm, '$1 ')
    .replace(/^(\s*\d+\.)\s{2,}/gm, '$1 ')
    .replace(/^(\s*[-*+] \[[ xX]\])\s{2,}/gm, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
