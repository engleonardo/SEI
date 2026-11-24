import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../icons';
import { classNames } from '../utils';
import { editorHtmlToMarkdown, markdownToEditorHtml } from '../editor/richText';

export interface DescriptionEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

type ShadowRootWithSelection = ShadowRoot & { getSelection?: () => Selection | null };

function selectionFor(element: HTMLElement | null): Selection | null {
  if (element) {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot) {
      const getSelection = (root as ShadowRootWithSelection).getSelection;
      if (typeof getSelection === 'function') {
        try {
          const selection = getSelection.call(root);
          if (selection) return selection;
        } catch {
          // alguns navegadores não implementam ShadowRoot.getSelection
        }
      }
    }
  }
  return window.getSelection();
}

function placeCaretAtEnd(element: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = selectionFor(element);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** O `checked` do HTML não acompanha o clique; sincroniza antes de virar Markdown. */
function syncCheckboxAttributes(element: HTMLElement): void {
  element.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
    if (input.checked) input.setAttribute('checked', '');
    else input.removeAttribute('checked');
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function DescriptionEditor({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  placeholder = 'Escreva a descrição…',
  ariaLabel = 'Descrição do cartão',
}: DescriptionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    const element = editorRef.current;
    if (!element) return;
    if (lastValue.current === value) return;
    element.innerHTML = markdownToEditorHtml(value);
    lastValue.current = value;
  }, [value]);

  useEffect(() => {
    const element = editorRef.current;
    if (!element || !autoFocus) return;
    element.focus();
    placeCaretAtEnd(element);
  }, [autoFocus]);

  const emit = () => {
    const element = editorRef.current;
    if (!element) return;
    syncCheckboxAttributes(element);
    const markdown = editorHtmlToMarkdown(element.innerHTML);
    lastValue.current = markdown;
    onChange(markdown);
  };

  const run = (command: string, argument?: string) => {
    if (disabled) return;
    const element = editorRef.current;
    if (!element) return;
    element.focus();
    document.execCommand(command, false, argument);
    emit();
  };

  const toggleBlock = (tag: 'h2' | 'h3' | 'blockquote' | 'p') => {
    const element = editorRef.current;
    if (!element || disabled) return;
    element.focus();
    const current = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    const target = current === tag ? 'p' : tag;
    document.execCommand('formatBlock', false, `<${target}>`);
    emit();
  };

  const openLink = () => {
    const selection = selectionFor(editorRef.current);
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl('');
    setLinkOpen(true);
  };

  const applyLink = () => {
    const url = normalizeUrl(linkUrl);
    if (!url) {
      setLinkOpen(false);
      return;
    }
    const element = editorRef.current;
    if (!element) return;
    element.focus();
    const selection = selectionFor(element);
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    if (selection && !selection.isCollapsed) {
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    }
    setLinkOpen(false);
    setLinkUrl('');
    emit();
  };

  const toolbarButton = (
    label: ReactNode,
    title: string,
    action: () => void,
    options: { className?: string; disabled?: boolean } = {},
  ) => (
    <button
      type="button"
      className={classNames('sf-editor__btn', options.className)}
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
      disabled={disabled || options.disabled}
    >
      {label}
    </button>
  );

  const insertTaskList = () => {
    if (disabled) return;
    const element = editorRef.current;
    if (!element) return;
    element.focus();
    document.execCommand('insertHTML', false, '<ul><li><input type="checkbox"> </li></ul>');
    const lists = element.querySelectorAll('ul');
    const lastItem = lists[lists.length - 1]?.querySelector('li');
    if (lastItem) placeCaretAtEnd(lastItem as HTMLElement);
    emit();
  };

  return (
    <div className={classNames('sf-editor', disabled && 'sf-editor--disabled')}>
      <div className="sf-editor__toolbar" role="toolbar" aria-label="Formatação da descrição">
        {toolbarButton(<strong>B</strong>, 'Negrito', () => run('bold'))}
        {toolbarButton(<em>I</em>, 'Itálico', () => run('italic'))}
        {toolbarButton(<span style={{ textDecoration: 'line-through' }}>S</span>, 'Tachado', () =>
          run('strikeThrough'),
        )}
        {toolbarButton('H2', 'Título', () => toggleBlock('h2'))}
        {toolbarButton('H3', 'Subtítulo', () => toggleBlock('h3'))}
        {toolbarButton(<Icon name="list" size={13} />, 'Lista com marcadores', () =>
          run('insertUnorderedList'),
        )}
        {toolbarButton('1.', 'Lista numerada', () => run('insertOrderedList'))}
        {toolbarButton(<Icon name="checklist" size={13} />, 'Lista de tarefas', insertTaskList)}
        {toolbarButton('❝', 'Citação', () => toggleBlock('blockquote'))}
        {toolbarButton(<Icon name="link" size={13} />, 'Inserir link', openLink)}
      </div>

      {linkOpen && (
        <div className="sf-editor__link">
          <input
            className="sf-editor__link-input"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setLinkOpen(false);
              }
            }}
            placeholder="https://…"
            aria-label="URL do link"
            autoFocus
          />
          <button
            type="button"
            className="sf-editor__link-btn sf-editor__link-btn--primary"
            onClick={applyLink}
          >
            Aplicar
          </button>
          <button type="button" className="sf-editor__link-btn" onClick={() => setLinkOpen(false)}>
            Cancelar
          </button>
        </div>
      )}

      <div
        ref={editorRef}
        className="sf-editor__content"
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        data-placeholder={placeholder}
        onInput={emit}
        onChange={(event) => {
          if ((event.target as HTMLElement).closest('input[type="checkbox"]')) emit();
        }}
        onBlur={emit}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
          emit();
        }}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) event.preventDefault();
          if ((event.target as HTMLElement).closest('input[type="checkbox"]')) emit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setLinkOpen(false);
          }
        }}
      />
    </div>
  );
}
