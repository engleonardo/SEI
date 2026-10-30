import { normalizeProcessNumber } from '../domain/process';

/** Formato do número de processo do SEI: 00000.000000/0000-00 */
const PROCESS_NUMBER = /\b\d{5}\.\d{6}\/\d{4}-\d{2}\b/g;

export interface LinkCandidate {
  cardId: string;
  cardName: string;
  processNumber: string;
  snippet: string;
}

export function findProcessNumbers(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(PROCESS_NUMBER)) {
    const number = normalizeProcessNumber(match[0]);
    if (number) found.add(number);
  }
  return Array.from(found);
}

export function snippetFor(
  text: string | null | undefined,
  processNumber: string,
  max = 140,
): string {
  if (!text) return '';
  const normalized = normalizeProcessNumber(processNumber) ?? processNumber;
  const line =
    text
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.includes(normalized)) ?? text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
