import { extractProcessNumber, normalizeProcessNumber } from '../domain/process';

const SCRIPT_PATTERNS = [
  /infraArvoreNo\s*\([^)]*?["']([0-9][0-9./-]{7,})["']/g,
  /["'](?:numeroProcesso|numProcesso|protocolo)["']\s*[:=]\s*["']([0-9][0-9./-]{7,})["']/gi,
  /["']([0-9]{5}\.[0-9]{6}\/[0-9]{4}-[0-9]{2})["']/g,
];

const HEADER_SELECTORS = [
  '#divArvoreAcoes .protocoloNR',
  '#divArvoreAcoes .infraArvoreNo',
  '.protocoloNR',
  '#spanNrProcesso',
  '#divInfraBarraSuperior .protocoloNR',
  '#divInfraBarraSuperior a[href*="procedimento_visualizar"]',
  'a[href*="acao=procedimento_visualizar"]',
];

const HEADER_CONTAINERS = ['#divArvoreAcoes', '#divInfraBarraSuperior', '#container', '#main', 'header'];

function fromScripts(doc: Document): string | null {
  const scripts = Array.from(doc.scripts);
  for (let i = scripts.length - 1; i >= 0; i -= 1) {
    const text = scripts[i]?.textContent ?? '';
    if (!text) continue;
    for (const pattern of SCRIPT_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) {
        const normalized = normalizeProcessNumber(match[1]);
        if (normalized) return normalized;
      }
    }
  }
  return null;
}

function fromSelectors(doc: Document): string | null {
  for (const selector of HEADER_SELECTORS) {
    for (const element of Array.from(doc.querySelectorAll(selector))) {
      const candidates = [
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('data-processo'),
        element.getAttribute('href'),
      ];
      for (const candidate of candidates) {
        const normalized = normalizeProcessNumber(candidate) ?? extractProcessNumber(candidate);
        if (normalized) return normalized;
      }
    }
  }
  return null;
}

function fromContainers(doc: Document): string | null {
  for (const selector of HEADER_CONTAINERS) {
    const element = doc.querySelector(selector);
    if (!element) continue;
    const text = (element.textContent ?? '').slice(0, 4000);
    const normalized = extractProcessNumber(text);
    if (normalized) return normalized;
  }
  return null;
}

function fromUrl(doc: Document): string | null {
  try {
    const url = new URL(doc.location?.href ?? '');
    const keys = ['numeroProcesso', 'numProcesso', 'protocolo', 'numero'];
    for (const key of keys) {
      const value = url.searchParams.get(key);
      const normalized = normalizeProcessNumber(value) ?? extractProcessNumber(value);
      if (normalized) return normalized;
    }
  } catch {
    // about:blank ou URL inválida
  }
  return null;
}

export function findProcessNumber(doc: Document = document): string | null {
  return fromScripts(doc) ?? fromSelectors(doc) ?? fromContainers(doc) ?? fromUrl(doc);
}

export function findProcessSpecification(doc: Document = document): string {
  for (const selector of HEADER_CONTAINERS) {
    const element = doc.querySelector(selector);
    if (!element) continue;
    const tooltip = element.getAttribute('onmouseover') ?? '';
    const match = tooltip.match(/infraTooltipMostrar\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]/);
    if (match?.[1]) return match[1];
    const title = element.getAttribute('title');
    if (title && title.length > 3) return title;
  }
  return '';
}
