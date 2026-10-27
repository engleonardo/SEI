const STANDARD_PROCESS = /\b\d{5}\.\d{6}\/\d{4}-\d{2}\b/;
const SECONDARY_PROCESS = /\b\d{5}\.\d{6}\/\d{4}\b/;
const SLASH_PROCESS = /\b\d{5}\/\d{6}\/\d{4}(?:-\d{2})?\b/;
const GENERIC_PROCESS = /\b\d{2,7}[./-]\d{3,8}[./-]\d{2,6}(?:[-/]\d{1,3})?\b/;

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

/**
 * Normaliza um número de processo já isolado (ex.: texto de um link do SEI).
 * Evita aceitar datas e IDs curtos.
 */
export function normalizeProcessNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/\s+/g, '');
  if (!value) return null;

  for (const pattern of [STANDARD_PROCESS, SECONDARY_PROCESS, SLASH_PROCESS, GENERIC_PROCESS]) {
    const match = value.match(pattern);
    if (match && digitCount(match[0]) >= 10) return match[0];
  }

  // Protocolos antigos podem vir sem separadores, mas com muitos dígitos.
  const digits = value.replace(/\D/g, '');
  if (/^[\d./-]+$/.test(value) && digits.length >= 15) return value;
  return null;
}

/**
 * Extrai o primeiro número de processo plausível de um texto livre.
 */
export function extractProcessNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  const normalized = text.replace(/\u00a0/g, ' ');

  for (const pattern of [STANDARD_PROCESS, SECONDARY_PROCESS, SLASH_PROCESS]) {
    const match = normalized.match(pattern);
    if (match && digitCount(match[0]) >= 10) return match[0];
  }

  const generic = normalized.match(GENERIC_PROCESS);
  if (generic && digitCount(generic[0]) >= 10) return generic[0];

  return null;
}

export function isSameProcess(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

export function sanitizeProcessForQuery(processNumber: string): string {
  return processNumber.replace(/["\\]/g, '');
}

export function parseProcessNumbers(input: string): string[] {
  const values = input
    .split(/[\s,;]+/)
    .map((value) => normalizeProcessNumber(value))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(values));
}
