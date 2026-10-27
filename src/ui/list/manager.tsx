import type { Root } from 'react-dom/client';
import type { SeiProcessRow } from '../../core/domain/types';
import { normalizeProcessNumber } from '../../core/domain/process';
import { findCommandBar, findProcessRows, findProcessTable, parseTooltip } from '../../core/sei/rows';
import { getSettings } from '../../core/storage/settings';
import { createShadowHost, mountReact } from '../shadow';
import { setThemePreference } from '../theme';
import { matchesProcess } from '../filters';
import { ListToolbar } from './ListToolbar';
import { ProcessRowCards } from './ProcessRowCards';
import { RowAction } from './RowAction';
import { listStore, loadList } from './store';

interface RowEntry {
  row: HTMLTableRowElement;
  processNumber: string;
  specification: string;
  actionHost: HTMLDivElement;
  actionRoot: Root;
  cardRow: HTMLTableRowElement;
  cardContainer: HTMLDivElement;
  cardRoot: Root | null;
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
    result.push({
      row,
      anchor,
      processNumber,
      specification: tooltip.specification,
      processType: tooltip.processType,
    });
  }
  return result;
}

export class ListManager {
  private entries = new Map<HTMLTableRowElement, RowEntry>();
  private toolbarRoot: Root | null = null;
  private toolbarHost: HTMLDivElement | null = null;
  private observer: MutationObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: number | null = null;
  private refreshTimer: number | null = null;
  private destroyed = false;

  async start(): Promise<void> {
    const settings = await getSettings();
    setThemePreference(settings.theme);

    this.mountToolbar();
    this.unsubscribe = listStore.subscribe(() => this.scheduleSync());
    this.observer = new MutationObserver(() => this.scheduleReconcile());
    this.observer.observe(document.body, { childList: true, subtree: true });

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
    this.unsubscribe?.();
    if (this.timer) window.clearTimeout(this.timer);
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);

    for (const entry of this.entries.values()) {
      entry.actionRoot.unmount();
      entry.cardRoot?.unmount();
      entry.actionHost.remove();
      entry.cardRow.remove();
      this.restoreRow(entry.row);
      delete entry.row.dataset.seiFlowFilterHidden;
      delete entry.row.dataset.seiFlowOriginalDisplay;
    }
    this.entries.clear();

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

  private mountToolbar(): void {
    const { host, container } = createShadowHost();
    host.style.display = 'block';
    host.style.margin = '4px 0';

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
        this.restoreRow(row);
        this.entries.delete(row);
      }
    }

    this.sync();
  }

  private ensureRow(info: SeiProcessRow): void {
    const existing = this.entries.get(info.row);
    if (existing && existing.actionHost.isConnected && existing.cardRow.isConnected) {
      existing.processNumber = info.processNumber;
      existing.specification = info.specification;
      return;
    }

    if (existing) {
      existing.actionRoot.unmount();
      existing.cardRoot?.unmount();
      existing.actionHost.remove();
      existing.cardRow.remove();
      this.entries.delete(info.row);
    }

    const lastCell = info.row.cells[info.row.cells.length - 1];
    if (!lastCell) return;

    const action = createShadowHost();
    action.host.style.display = 'inline-flex';
    action.host.style.verticalAlign = 'middle';
    action.host.style.marginLeft = '4px';
    lastCell.appendChild(action.host);
    const actionRoot = mountReact(
      action.container,
      <RowAction processNumber={info.processNumber} specification={info.specification} />,
    );

    const cardRow = document.createElement('tr');
    cardRow.setAttribute('data-sei-flow-card-row', '');
    const cell = document.createElement('td');
    cell.colSpan = Math.max(1, info.row.cells.length);
    cell.style.padding = '0';
    cell.style.border = '0';
    cell.style.background = 'transparent';

    const card = createShadowHost();
    card.host.style.display = 'block';
    card.host.style.padding = '2px 1px 8px';
    cell.appendChild(card.host);
    cardRow.appendChild(cell);
    info.row.insertAdjacentElement('afterend', cardRow);

    this.entries.set(info.row, {
      row: info.row,
      processNumber: info.processNumber,
      specification: info.specification,
      actionHost: action.host,
      actionRoot,
      cardRow,
      cardContainer: card.container,
      cardRoot: null,
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

      this.applyFilter(entry.row, visible);
      const rowVisible = window.getComputedStyle(entry.row).display !== 'none';
      const shouldShowCards = visible && rowVisible && cards.length > 0;

      if (cards.length > 0 && !entry.cardRoot) {
        entry.cardRoot = mountReact(
          entry.cardContainer,
          <ProcessRowCards processNumber={entry.processNumber} compact />,
        );
      } else if (cards.length === 0 && entry.cardRoot) {
        entry.cardRoot.unmount();
        entry.cardRoot = null;
      }

      entry.cardRow.style.display = shouldShowCards ? '' : 'none';
    }
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
