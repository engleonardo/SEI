import { normalizeProcessNumber } from '../domain/process';

const LINK_LINE = /^[ \t]*SEI[ \t]+([0-9][0-9./-]{7,})[ \t]*$/i;
const LEGACY_URL_LINE = /^[ \t]*Processo SEI:[ \t]*https?:\/\/\S+[ \t]*$/i;
const SEPARATOR_LINE = /^[ \t]*-{3,}[ \t]*$/;
const WARNING_LINE = /^[ \t]*Não altere as informações abaixo\.[ \t]*$/i;

export const LINK_WARNING = 'Não altere as informações abaixo.';
const LINK_SEPARATOR = '---';

function parseLinkLine(line: string): string | null {
  const match = line.match(LINK_LINE);
  if (!match) return null;
  return normalizeProcessNumber(match[1]);
}

export function parseLinks(description: string | null | undefined): string[] {
  if (!description) return [];
  const links: string[] = [];
  const seen = new Set<string>();
  for (const line of description.split('\n')) {
    const process = parseLinkLine(line);
    if (!process || seen.has(process)) continue;
    seen.add(process);
    links.push(process);
  }
  return links;
}

function isBlockLine(line: string): boolean {
  return (
    parseLinkLine(line) !== null ||
    LEGACY_URL_LINE.test(line) ||
    WARNING_LINE.test(line)
  );
}

/**
 * Remove o bloco de vínculo (separador, aviso e linhas `SEI <processo>`),
 * preservando o texto escrito pelo usuário.
 */
export function stripLinks(description: string | null | undefined): string {
  if (!description) return '';
  const lines = description.replace(/\r\n/g, '\n').split('\n');
  const kept: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';

    if (isBlockLine(line)) continue;

    if (SEPARATOR_LINE.test(line)) {
      let next = index + 1;
      while (next < lines.length && !(lines[next] ?? '').trim()) next += 1;
      const following = lines[next] ?? '';
      const closesBlock = next >= lines.length || isBlockLine(following);
      if (closesBlock) continue;
    }

    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+$/gm, '')
    .trim();
}

/** Reescreve o bloco de vínculo no fim da descrição. */
export function renderLinks(
  description: string | null | undefined,
  links: string[],
): string {
  const clean = stripLinks(description);
  const normalized = links
    .map((process) => normalizeProcessNumber(process))
    .filter((process): process is string => Boolean(process));

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) return clean;

  const block = [
    LINK_SEPARATOR,
    LINK_WARNING,
    ...unique.map((process) => `SEI ${process}`),
  ].join('\n');

  return clean ? `${clean}\n\n${block}` : block;
}

export function addLink(description: string | null | undefined, processNumber: string): string {
  const process = normalizeProcessNumber(processNumber);
  if (!process) throw new Error('Número de processo inválido.');
  return renderLinks(description, [...parseLinks(description), process]);
}

export function removeLink(description: string | null | undefined, processNumber: string): string {
  const process = normalizeProcessNumber(processNumber);
  if (!process) throw new Error('Número de processo inválido.');
  return renderLinks(
    description,
    parseLinks(description).filter((link) => link !== process),
  );
}

export function hasLink(description: string | null | undefined, processNumber: string): boolean {
  const process = normalizeProcessNumber(processNumber);
  return !!process && parseLinks(description).includes(process);
}
