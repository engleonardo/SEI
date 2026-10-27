import { normalizeProcessNumber } from '../domain/process';

const LINK_LINE = /^[ \t]*SEI[ \t]+([0-9][0-9./-]{7,})[ \t]*$/gim;

export function parseLinks(description: string | null | undefined): string[] {
  if (!description) return [];
  const links: string[] = [];
  const seen = new Set<string>();
  for (const match of description.matchAll(LINK_LINE)) {
    const process = normalizeProcessNumber(match[1]);
    if (!process || seen.has(process)) continue;
    seen.add(process);
    links.push(process);
  }
  return links;
}

export function stripLinks(description: string | null | undefined): string {
  if (!description) return '';
  return description
    .replace(LINK_LINE, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '')
    .trim();
}

export function addLink(description: string | null | undefined, processNumber: string): string {
  const process = normalizeProcessNumber(processNumber);
  if (!process) throw new Error('Número de processo inválido.');
  const base = (description ?? '').replace(/\r\n/g, '\n').trim();
  if (parseLinks(base).includes(process)) return base;
  return base ? `SEI ${process}\n${base}` : `SEI ${process}`;
}

export function removeLink(description: string | null | undefined, processNumber: string): string {
  const process = normalizeProcessNumber(processNumber);
  if (!process) throw new Error('Número de processo inválido.');
  const base = (description ?? '').replace(/\r\n/g, '\n');

  const lines = base.split('\n').filter((line) => {
    const match = line.match(/^[ \t]*SEI[ \t]+([0-9][0-9./-]{7,})[ \t]*$/i);
    if (!match) return true;
    return normalizeProcessNumber(match[1]) !== process;
  });

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '')
    .trim();
}

export function hasLink(description: string | null | undefined, processNumber: string): boolean {
  const process = normalizeProcessNumber(processNumber);
  return !!process && parseLinks(description).includes(process);
}
