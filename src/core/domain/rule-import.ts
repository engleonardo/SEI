import { newRuleId, type Rule } from './rules';

export class RulesImportError extends Error {}

function isRuleLike(value: unknown): value is Rule {
  return Boolean(value && typeof value === 'object' && 'trigger' in value && 'actions' in value);
}

/**
 * Lê regras coladas ou vindas de arquivo. Aceita o envelope exportado pelo SEI Flow
 * (`sei-flow-rules`), um backup completo (`sei-flow`) ou apenas a lista de regras.
 */
export function parseRulesImport(text: string): Rule[] {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new RulesImportError('Cole o JSON das regras ou selecione um arquivo.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new RulesImportError('JSON inválido. Confira o conteúdo colado.');
  }

  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const envelope = parsed as { app?: unknown; rules?: unknown };
    if (
      envelope.app !== undefined &&
      envelope.app !== 'sei-flow-rules' &&
      envelope.app !== 'sei-flow'
    ) {
      throw new RulesImportError('Arquivo inválido. Use um JSON gerado pelo SEI Flow.');
    }
    list = envelope.rules;
  }

  if (!Array.isArray(list)) {
    throw new RulesImportError('O JSON não contém uma lista de regras.');
  }

  const rules = list.filter(isRuleLike).map((rule) => ({
    ...rule,
    id: typeof rule.id === 'string' && rule.id ? rule.id : newRuleId(),
  }));

  if (rules.length === 0) {
    throw new RulesImportError('Nenhuma regra válida encontrada no JSON.');
  }

  return rules;
}
