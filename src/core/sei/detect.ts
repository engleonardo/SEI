import type { SeiPageKind } from '../domain/types';
import { findProcessNumber } from './process-number';
import { findProcessRows } from './rows';

function actionFromUrl(url: string): string {
  try {
    return new URL(url).searchParams.get('acao') ?? '';
  } catch {
    return '';
  }
}

export function detectPageKind(doc: Document = document, url?: string): SeiPageKind {
  const href = url ?? doc.location?.href ?? '';
  const action = actionFromUrl(href);

  if (action === 'procedimento_controlar') return 'process-list';

  if (
    action === 'procedimento_trabalhar' ||
    action === 'procedimento_visualizar' ||
    action === 'arvore_visualizar'
  ) {
    if (findProcessNumber(doc)) return 'process-content';
    if (findProcessRows(doc).length > 0) return 'process-list';
    return 'unknown';
  }

  if (findProcessRows(doc).length > 0) return 'process-list';
  if (findProcessNumber(doc)) return 'process-content';
  return 'unknown';
}

export function detectSeiVersion(doc: Document = document): 'v3' | 'v4' | 'v5' | 'unknown' {
  if (doc.querySelector('#divComandosSEI')) return 'v4';
  if (doc.querySelector('#divArvoreAcoes')) return 'v3';
  if (doc.querySelector('.infraBarraComandos')) return 'v4';
  if (doc.querySelector('#divComandos')) return 'v3';
  return 'unknown';
}
