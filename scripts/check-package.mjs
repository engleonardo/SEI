/**
 * Confere (e opcionalmente remove) entradas com nomes reservados pelo Chrome
 * dentro do build da extensão. O Chrome recusa carregar uma pasta que tenha
 * arquivos ou diretórios começando com "_", com exceção de "_locales".
 *
 * Uso:
 *   node scripts/check-package.mjs [--fix] [pastas...]
 *
 * Sem pastas, verifica os builds padrão em .output.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const DEFAULTS = ['.output/chrome-mv3', '.output/firefox-mv3', '.output/edge-mv3'];
// Só "_locales" é permitido. "_metadata" é criado pelo Chrome em extensões da
// loja e "__MACOSX" aparece ao descompactar zips no macOS.
const ALLOWED = new Set(['_locales']);
const REMOVABLE = new Set(['_metadata', '__MACOSX']);

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const folders = args.filter((arg) => !arg.startsWith('--'));
const targets = (folders.length > 0 ? folders : DEFAULTS).map((folder) => resolve(folder));

/** Lista entradas proibidas, sem entrar nas que serão removidas. */
function findReserved(root, current = root) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.name.startsWith('_')) continue;
    if (ALLOWED.has(entry.name)) continue;
    const path = join(current, entry.name);
    if (REMOVABLE.has(entry.name)) {
      found.push({ path, name: entry.name });
      continue;
    }
    found.push({ path, name: entry.name });
    if (entry.isDirectory()) found.push(...findReserved(root, path));
  }
  return found;
}

let failed = false;

for (const target of targets) {
  if (!existsSync(target) || !statSync(target).isDirectory()) continue;

  const reserved = findReserved(target);
  if (reserved.length === 0) {
    console.log(`[ok] ${relative(process.cwd(), target) || target}: nenhum nome reservado.`);
    continue;
  }

  for (const entry of reserved) {
    const label = relative(process.cwd(), entry.path) || entry.path;
    if (fix && REMOVABLE.has(entry.name)) {
      rmSync(entry.path, { recursive: true, force: true });
      console.log(`[removido] ${label}`);
    } else {
      failed = true;
      console.error(
        `[erro] ${label}: nomes começando com "_" são reservados pelo Chrome ` +
          '(exceto _locales). Remova essa pasta/arquivo e gere o pacote de novo.',
      );
    }
  }
}

if (failed) {
  console.error(
    '\nDica: se a pasta veio do perfil do Chrome ou de um CRX da loja, não a carregue. ' +
      'Use o zip da release, extraia em uma pasta nova ou rode "npm run unpacked".',
  );
  process.exit(1);
}

if (targets.some((target) => existsSync(target))) {
  console.log('\nPronto para carregar no navegador (Modo desenvolvedor > Carregar sem compactação).');
}
