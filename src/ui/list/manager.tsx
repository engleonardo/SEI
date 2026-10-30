import type { Root } from 'react-dom/client';
import type { SeiProcessRow } from '../../core/domain/types';
import { normalizeProcessNumber } from '../../core/domain/process';
import { findCommandBar, findProcessRows, findProcessTable, parseTooltip } from '../../core/sei/rows';
import { getSettings, watchSettings } from '../../core/storage/settings';
import { callRpc } from '../../core/messaging/client';
import { createShadowHost, mountReact } from '../shadow';
import { setThemePreference } from '../theme';
import { matchesProcess } from '../filters';
import { ListToolbar } from './ListToolbar';
import { ProcessRowCards } from './ProcessRowCards';
import { RowAction } from './RowAction';
import { listStore, loadList } from './store';

interface RowEntry {
  row: HTMLTableRowElement;
  anchor: HTMLAnchorElement;
  processNumber: string;
  specification: string;
  url: string;
  highlight: boolean;
  actionHost: HTMLDivElement;
  actionRoot: Root;
  cardRow: HTMLTableRowElement;
  cardContainer: HTMLDivElement;
  cardRoot: Root | null;
  spacerRow: HTMLTableRowElement;
}

interface CellStyleSnapshot {
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomLeftRadius: string;
  borderBottomRightRadius: string;
  backgroundColor: string;
  overflow: string;
}

function isHighlighted(row: HTMLTableRowElement, anchor: HTMLAnchorElement): boolean {
  return (
    anchor.classList.contains('processoNaoVisualizado') ||
    row.classList.contains('infraTrNaoVisualizada') ||
    row.classList.contains('processoNaoVisualizado')
  );
}

function findActionCell(row: HTMLTableRowElement, anchor: HTMLAnchorElement): HTMLTableCellElement | null {
  const processCell = anchor.closest('td');
  const cells = Array.from(row.cells);
  const processIndex = processCell ? cells.indexOf(processCell) : cells.length;
  const tagCell = cells
    .slice(0, Math.max(0, processIndex))
    .find((cell) => Boolean(cell.querySelector('img, .infraIcone, [class*="marcador"], [class*="tag"]')));
  return tagCell ?? processCell ?? cells[cells.length - 1] ?? null;
}

function collectRows(): SeiProcessRow[] {
  const result: SeiProcessRow[] = [];
  for (const row of findProcessRows(document)) {
    const anchor = row.querySelector<HTMLAnchorElement>(
      'a[class^="processo"], a[href*="acao=procedimento_trabalhar"]',
    );
    if (!anchor) continue;
    const processNumber =
      normalizeProcessNumber(anchor.textContent) ?? normalizeProcessNumber(row.textContent);
    if (!processNumber) continue;
    const tooltip = parseTooltip(anchor.getAttribute('onmouseover') ?? row.getAttribute('onmouseover'));
    let origin = '';
    try {
      const url = new URL(anchor.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
    } catch {
      origin = '';
    }
    result.push({
      row,
      anchor,
      processNumber,
      specification: tooltip.specification,
      processType: tooltip.processType,
      url: anchor.href,
      origin,
      highlight: isHighlighted(row, anchor),
    });
  }
  return result;
}

export class ListManager {
  private entries = new Map<HTMLTableRowElement, RowEntry>();
  private toolbarRoot: Root | null = null;
  private toolbarHost: HTMLDivElement | null = null;
  private observer: MutationObserver | null = null;
  private cardObserver: IntersectionObserver | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private unwatchSettings: (() => void) | null = null;
  private timer: number | null = null;
  private refreshTimer: number | null = null;
  private catalogTimer: number | null = null;
  private catalogSignature = '';
  private destroyed = false;
  private theme: 'light' | 'dark' = 'light';
  private table: HTMLTableElement | null = null;
  private originalTableStyle: { borderCollapse: string; borderSpacing: string } | null = null;
  private originalCellStyles = new WeakMap<HTMLTableCellElement, CellStyleSnapshot>();
  private originalRowBackgrounds = new WeakMap<HTMLTableRowElement, string>();

  async start(): Promise<void> {
    const settings = await getSettings();
    this.theme = settings.theme === 'dark' ? 'dark' : 'light';
    setThemePreference(settings.theme);

    this.mountToolbar();
    this.prepareTable();
    this.unsubscribe = listStore.subscribe(() => this.scheduleSync());
    this.unwatchSettings = watchSettings((next) => {
      const theme = next.theme === 'dark' ? 'dark' : 'light';
      setThemePreference(next.theme);
      if (theme === this.theme) return;
      this.theme = theme;
      for (const entry of this.entries.values()) this.restoreCardShell(entry);
      this.scheduleSync();
    });
    this.observer = new MutationObserver(() => this.scheduleReconcile());
    this.observer.observe(document.body, { childList: true, subtree: true });

    if (typeof IntersectionObserver !== 'undefined') {
      this.cardObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.mountCardsForRow(entry.target as HTMLTableRowElement);
          }
        },
        { rootMargin: '300px' },
      );
    }

    this.keyHandler = (event: KeyboardEvent) => {
      const target = event.composedPath()[0];
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (editable) return;
      const isShortcut =
        event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (!isShortcut) return;
      const input = this.toolbarHost?.shadowRoot?.querySelector<HTMLInputElement>('input');
      if (!input) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', this.keyHandler);

    this.reconcile();
    void loadList();

    if (settings.autoRefreshMinutes > 0) {
      this.refreshTimer = window.setInterval(
        () => void loadList(),
        settings.autoRefreshMinutes * 60_000,
      );
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.observer?.disconnect();
    this.cardObserver?.disconnect();
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    this.unsubscribe?.();
    this.unwatchSettings?.();
    if (this.timer) window.clearTimeout(this.timer);
    if (this.catalogTimer) window.clearTimeout(this.catalogTimer);
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);

    for (const entry of this.entries.values()) {
      entry.actionRoot.unmount();
      entry.cardRoot?.unmount();
      entry.actionHost.remove();
      entry.cardRow.remove();
      entry.spacerRow.remove();
      this.restoreCardShell(entry);
      this.restoreRow(entry.row);
      delete entry.row.dataset.seiFlowFilterHidden;
      delete entry.row.dataset.seiFlowOriginalDisplay;
    }
    this.entries.clear();
    this.restoreTable();

    this.toolbarRoot?.unmount();
    this.toolbarHost?.remove();
  }

  private scheduleReconcile(): void {
    if (this.destroyed) return;
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.reconcile();
    }, 200);
  }

  private scheduleSync(): void {
    if (this.destroyed) return;
    this.scheduleReconcile();
  }

  private prepareTable(): void {
    const table = findProcessTable(document);
    if (!table || table === this.table) return;
    this.table = table;
    this.originalTableStyle = {
      borderCollapse: table.style.borderCollapse,
      borderSpacing: table.style.borderSpacing,
    };
    table.style.borderCollapse = 'separate';
    table.style.borderSpacing = '0';
  }

  private restoreTable(): void {
    if (this.table && this.originalTableStyle) {
      this.table.style.borderCollapse = this.originalTableStyle.borderCollapse;
      this.table.style.borderSpacing = this.originalTableStyle.borderSpacing;
    }
    this.table = null;
    this.originalTableStyle = null;
  }

  private cardColors() {
    return this.theme === 'dark'
      ? { border: '#3a3f47', header: '#2a2e35', body: '#1c1f24', danger: '#ff8a80', dangerBg: '#3b2323' }
      : { border: '#d9e2ec', header: '#f1f5f9', body: '#ffffff', danger: '#c0392b', dangerBg: '#fff1f1' };
  }

  private snapshotCell(cell: HTMLTableCellElement): void {
    if (this.originalCellStyles.has(cell)) return;
    this.originalCellStyles.set(cell, {
      borderTop: cell.style.borderTop,
      borderRight: cell.style.borderRight,
      borderBottom: cell.style.borderBottom,
      borderLeft: cell.style.borderLeft,
      borderTopLeftRadius: cell.style.borderTopLeftRadius,
      borderTopRightRadius: cell.style.borderTopRightRadius,
      borderBottomLeftRadius: cell.style.borderBottomLeftRadius,
      borderBottomRightRadius: cell.style.borderBottomRightRadius,
      backgroundColor: cell.style.backgroundColor,
      overflow: cell.style.overflow,
    });
  }

  private restoreCell(cell: HTMLTableCellElement): void {
    const original = this.originalCellStyles.get(cell);
    if (!original) return;
    cell.style.borderTop = original.borderTop;
    cell.style.borderRight = original.borderRight;
    cell.style.borderBottom = original.borderBottom;
    cell.style.borderLeft = original.borderLeft;
    cell.style.borderTopLeftRadius = original.borderTopLeftRadius;
    cell.style.borderTopRightRadius = original.borderTopRightRadius;
    cell.style.borderBottomLeftRadius = original.borderBottomLeftRadius;
    cell.style.borderBottomRightRadius = original.borderBottomRightRadius;
    cell.style.backgroundColor = original.backgroundColor;
    cell.style.overflow = original.overflow;
    this.originalCellStyles.delete(cell);
  }

  private applyCardShell(entry: RowEntry, hasCards: boolean, highlight: boolean): void {
    const colors = this.cardColors();
    const border = highlight ? colors.danger : colors.border;
    const cells = Array.from(entry.row.cells);
    const dark = this.theme === 'dark';

    if (dark) {
      // No tema escuro, a linha do SEI não é alterada: só o cartão injetado fica escuro.
      for (const cell of cells) this.restoreCell(cell);
      const originalBackground = this.originalRowBackgrounds.get(entry.row);
      if (originalBackground !== undefined) {
        entry.row.style.backgroundColor = originalBackground;
        this.originalRowBackgrounds.delete(entry.row);
      }
    } else {
      const header = highlight ? colors.dangerBg : colors.header;
      if (!this.originalRowBackgrounds.has(entry.row)) {
        this.originalRowBackgrounds.set(entry.row, entry.row.style.backgroundColor);
      }
      entry.row.style.backgroundColor = 'transparent';

      cells.forEach((cell, index) => {
        this.snapshotCell(cell);
        const first = index === 0;
        const last = index === cells.length - 1;
        cell.style.borderTop = `1px solid ${border}`;
        cell.style.borderLeft = first ? `1px solid ${border}` : '0';
        cell.style.borderRight = last ? `1px solid ${border}` : '0';
        cell.style.borderBottom = hasCards ? '0' : `1px solid ${border}`;
        cell.style.borderTopLeftRadius = first ? '14px' : '0';
        cell.style.borderTopRightRadius = last ? '14px' : '0';
        cell.style.borderBottomLeftRadius = !hasCards && first ? '14px' : '0';
        cell.style.borderBottomRightRadius = !hasCards && last ? '14px' : '0';
        cell.style.backgroundColor = header;
      });
    }

    const cardCell = entry.cardRow.cells[0];
    if (cardCell) {
      this.snapshotCell(cardCell);
      cardCell.style.borderTop = `1px solid ${border}`;
      cardCell.style.borderLeft = `1px solid ${border}`;
      cardCell.style.borderRight = `1px solid ${border}`;
      cardCell.style.borderBottom = `1px solid ${border}`;
      cardCell.style.borderBottomLeftRadius = '14px';
      cardCell.style.borderBottomRightRadius = '14px';
      cardCell.style.backgroundColor = colors.body;
      cardCell.style.overflow = 'hidden';
    }
  }

  private restoreCardShell(entry: RowEntry): void {
    for (const cell of Array.from(entry.row.cells)) this.restoreCell(cell);
    const cardCell = entry.cardRow.cells[0];
    if (cardCell) this.restoreCell(cardCell);
    const originalBackground = this.originalRowBackgrounds.get(entry.row);
    if (originalBackground !== undefined) {
      entry.row.style.backgroundColor = originalBackground;
      this.originalRowBackgrounds.delete(entry.row);
    }
  }

  private mountToolbar(): void {
    const { host, container } = createShadowHost();
    host.style.display = 'block';
    host.style.margin = '4px 0';
    host.style.position = 'sticky';
    host.style.top = '0';
    host.style.zIndex = '50';

    const commandBar = findCommandBar(document);
    const table = findProcessTable(document);
    if (commandBar?.parentElement) {
      commandBar.insertAdjacentElement('afterend', host);
    } else if (table?.parentElement) {
      table.parentElement.insertBefore(host, table);
    } else {
      document.body.insertBefore(host, document.body.firstChild);
    }

    this.toolbarHost = host;
    this.toolbarRoot = mountReact(container, <ListToolbar />);
  }

  private reconcile(): void {
    if (this.destroyed) return;

    const infos = collectRows();
    const connected = new Set<HTMLTableRowElement>();
    this.queueProcessCatalog(infos);

    for (const info of infos) {
      connected.add(info.row);
      this.ensureRow(info);
    }

    for (const [row, entry] of Array.from(this.entries.entries())) {
      if (!row.isConnected || !connected.has(row)) {
        entry.actionRoot.unmount();
        entry.cardRoot?.unmount();
        entry.actionHost.remove();
        entry.cardRow.remove();
        entry.spacerRow.remove();
        this.restoreCardShell(entry);
        this.restoreRow(row);
        this.entries.delete(row);
      }
    }

    this.sync();
  }

  private ensureRow(info: SeiProcessRow): void {
    const existing = this.entries.get(info.row);
    if (
      existing &&
      existing.actionHost.isConnected &&
      existing.cardRow.isConnected &&
      existing.spacerRow.isConnected
    ) {
      existing.processNumber = info.processNumber;
      existing.specification = info.specification;
      existing.url = info.url;
      existing.highlight = info.highlight;
      return;
    }

    if (existing) {
      existing.actionRoot.unmount();
      existing.cardRoot?.unmount();
      existing.actionHost.remove();
      existing.cardRow.remove();
      existing.spacerRow.remove();
      this.restoreCardShell(existing);
      this.entries.delete(info.row);
    }

    const actionCell = findActionCell(info.row, info.anchor);
    if (!actionCell) return;

    const action = createShadowHost();
    action.host.style.display = 'inline-flex';
    action.host.style.verticalAlign = 'middle';
    action.host.style.marginLeft = '3px';
    actionCell.appendChild(action.host);
    const actionRoot = mountReact(
      action.container,
      <RowAction
        processNumber={info.processNumber}
        specification={info.specification}
        highlight={info.highlight}
      />,
    );

    const cardRow = document.createElement('tr');
    cardRow.setAttribute('data-sei-flow-card-row', '');
    cardRow.style.border = '0';
    cardRow.style.background = 'transparent';
    const cell = document.createElement('td');
    cell.colSpan = Math.max(1, info.row.cells.length);
    cell.style.padding = '0';
    cell.style.border = '0';
    cell.style.background = 'transparent';

    const card = createShadowHost();
    card.host.style.display = 'block';
    card.host.style.padding = '0';
    card.host.style.margin = '0';
    cell.appendChild(card.host);
    cardRow.appendChild(cell);
    info.row.insertAdjacentElement('afterend', cardRow);

    const spacerRow = document.createElement('tr');
    spacerRow.setAttribute('data-sei-flow-spacer', '');
    spacerRow.setAttribute('aria-hidden', 'true');
    const spacerCell = document.createElement('td');
    spacerCell.colSpan = Math.max(1, info.row.cells.length);
    spacerCell.style.height = '14px';
    spacerCell.style.padding = '0';
    spacerCell.style.border = '0';
    spacerCell.style.background = 'transparent';
    spacerRow.appendChild(spacerCell);
    cardRow.insertAdjacentElement('afterend', spacerRow);

    this.entries.set(info.row, {
      row: info.row,
      anchor: info.anchor,
      processNumber: info.processNumber,
      specification: info.specification,
      url: info.url,
      highlight: info.highlight,
      actionHost: action.host,
      actionRoot,
      cardRow,
      cardContainer: card.container,
      cardRoot: null,
      spacerRow,
    });
  }

  private sync(): void {
    const state = listStore.get();

    for (const entry of this.entries.values()) {
      const cards = state.cards.filter((card) => card.links.includes(entry.processNumber));
      const visible = matchesProcess(
        {
          processNumber: entry.processNumber,
          specification: entry.specification,
          cards,
        },
        state.filters,
      );

      const highlight = isHighlighted(entry.row, entry.anchor);
      if (highlight !== entry.highlight) {
        entry.highlight = highlight;
        entry.actionRoot.render(
          <RowAction
            processNumber={entry.processNumber}
            specification={entry.specification}
            highlight={highlight}
          />,
        );
        entry.cardRoot?.render(
          <ProcessRowCards
            processNumber={entry.processNumber}
            compact
            highlight={highlight}
          />,
        );
      }

      this.applyFilter(entry.row, visible);
      const rowVisible = window.getComputedStyle(entry.row).display !== 'none';
      const shouldShowCards = visible && rowVisible && cards.length > 0;

      entry.cardRow.style.display = shouldShowCards ? '' : 'none';
      entry.spacerRow.style.display = visible && rowVisible ? '' : 'none';
      this.applyCardShell(entry, cards.length > 0, highlight);

      if (cards.length > 0) {
        if (!entry.cardRoot && shouldShowCards) {
          const rect = entry.cardRow.getBoundingClientRect();
          const nearViewport = rect.top < window.innerHeight + 300 && rect.bottom > -300;
          if (!this.cardObserver || nearViewport) {
            this.mountCardsForRow(entry.cardRow);
          } else {
            this.cardObserver.observe(entry.cardRow);
          }
        }
      } else if (entry.cardRoot) {
        entry.cardRoot.unmount();
        entry.cardRoot = null;
        this.cardObserver?.unobserve(entry.cardRow);
      }
    }
  }

  private mountCardsForRow(cardRow: HTMLTableRowElement): void {
    const entry = Array.from(this.entries.values()).find((item) => item.cardRow === cardRow);
    if (!entry || entry.cardRoot || cardRow.style.display === 'none') return;
    const cards = listStore.get().cards.filter((card) =>
      card.links.includes(entry.processNumber),
    );
    if (cards.length === 0) return;
    this.cardObserver?.unobserve(cardRow);
    entry.cardRoot = mountReact(
      entry.cardContainer,
      <ProcessRowCards
        processNumber={entry.processNumber}
        compact
        highlight={entry.highlight}
      />,
    );
  }

  private queueProcessCatalog(infos: SeiProcessRow[]): void {
    const records = infos
      .filter((info) => Boolean(info.processNumber))
      .map((info) => ({
        number: info.processNumber,
        specification: info.specification,
        processType: info.processType,
        url: info.url,
        origin: info.origin,
        unread: info.highlight,
      }));
    if (records.length === 0) return;

    const signature = records
      .map(
        (record) =>
          `${record.number}|${record.specification}|${record.processType}|${record.url}|${record.unread ? 1 : 0}`,
      )
      .join('\n');
    if (signature === this.catalogSignature) return;
    this.catalogSignature = signature;

    if (this.catalogTimer) window.clearTimeout(this.catalogTimer);
    this.catalogTimer = window.setTimeout(() => {
      this.catalogTimer = null;
      void callRpc('processes:upsert', { processes: records })
        .then((result) => {
          if (result.rulesApplied > 0) void loadList();
        })
        .catch(() => undefined);
    }, 1_200);
  }

  private applyFilter(row: HTMLTableRowElement, visible: boolean): void {
    if (!visible) {
      if (!row.dataset.seiFlowFilterHidden) {
        row.dataset.seiFlowOriginalDisplay = row.style.display;
        row.dataset.seiFlowFilterHidden = '1';
      }
      row.style.display = 'none';
      return;
    }
    this.restoreRow(row);
  }

  private restoreRow(row: HTMLTableRowElement): void {
    if (!row.dataset.seiFlowFilterHidden) return;
    row.style.display = row.dataset.seiFlowOriginalDisplay ?? '';
    delete row.dataset.seiFlowFilterHidden;
    delete row.dataset.seiFlowOriginalDisplay;
  }
}

declare global {
  interface Window {
    __seiFlowListManager?: ListManager;
  }
}

export function startListManager(): () => void {
  window.__seiFlowListManager?.destroy();
  const manager = new ListManager();
  window.__seiFlowListManager = manager;
  void manager.start();
  return () => {
    manager.destroy();
    if (window.__seiFlowListManager === manager) delete window.__seiFlowListManager;
  };
}
