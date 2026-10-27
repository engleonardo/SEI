import { normalizeProcessNumber } from '../domain/process';

export function parseTooltip(onmouseover: string | null): { specification: string; processType: string } {
  if (!onmouseover) return { specification: '', processType: '' };
  const match = onmouseover.match(
    /infraTooltipMostrar\(\s*(['"])([\s\S]*?)\1\s*,\s*(['"])([\s\S]*?)\3/,
  );
  if (!match) return { specification: '', processType: '' };
  return {
    specification: (match[2] ?? '').replace(/\\&quot;/g, '"').replace(/\\r\\n|\\r|\\n/g, '\n').trim(),
    processType: (match[4] ?? '').trim(),
  };
}

export function findProcessTable(doc: Document = document): HTMLTableElement | null {
  const rows = doc.querySelectorAll('tr');
  for (const row of Array.from(rows)) {
    if (row.querySelector('a[class^="processo"], a[href*="acao=procedimento_trabalhar"]')) {
      return row.closest('table');
    }
  }
  return doc.querySelector('table.infraTable, #divInfraAreaTabela table');
}

export function findProcessRows(doc: Document = document): HTMLTableRowElement[] {
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(
      'a[class^="processo"], a[href*="acao=procedimento_trabalhar"]',
    ),
  );

  const rows: HTMLTableRowElement[] = [];
  const seen = new Set<HTMLTableRowElement>();

  for (const anchor of anchors) {
    if (anchor.closest('[data-sei-flow]')) continue;
    const row = anchor.closest('tr');
    if (!row || seen.has(row)) continue;
    if (!normalizeProcessNumber(anchor.textContent)) continue;
    seen.add(row);
    rows.push(row);
  }

  return rows;
}

export function findCommandBar(doc: Document = document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('#divComandos') ??
    doc.querySelector<HTMLElement>('#divComandosSEI') ??
    doc.querySelector<HTMLElement>('.infraBarraComandos') ??
    doc.querySelector<HTMLElement>('[id*="Comandos"]')
  );
}

export function findProcessContentAnchor(doc: Document = document): HTMLElement | null {
  return (
    doc.querySelector<HTMLElement>('#divArvoreAcoes') ??
    doc.querySelector<HTMLElement>('#divComandos') ??
    doc.querySelector<HTMLElement>('.infraBarraComandos') ??
    doc.querySelector<HTMLElement>('#container') ??
    doc.body
  );
}
