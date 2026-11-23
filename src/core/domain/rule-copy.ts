import { newRuleId, type Rule, type RuleAction } from './rules';
import type { TrelloLabel, TrelloList } from './types';

export interface BoardReferenceData {
  lists: TrelloList[];
  labels: TrelloLabel[];
}

export interface CopyRulesResult {
  rules: Rule[];
  copied: number;
  skipped: number;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

/**
 * Copia regras de um quadro para outro associando listas e etiquetas **pelo
 * nome**. Regras que dependem de uma lista ou etiqueta que não existe no
 * destino são ignoradas, em vez de apontar para um item parecido.
 */
export function copyRulesToBoard(
  sourceRules: Rule[],
  source: BoardReferenceData,
  target: BoardReferenceData,
  targetBoardId: string,
): CopyRulesResult {
  const sourceListById = new Map(source.lists.map((list) => [list.id, list]));
  const targetListByName = new Map(target.lists.map((list) => [normalizeName(list.name), list]));

  const sourceLabelById = new Map(source.labels.map((label) => [label.id, label]));
  const targetLabelByName = new Map(
    target.labels.filter((label) => label.name.trim()).map((label) => [normalizeName(label.name), label]),
  );
  const targetUnnamedLabelByColor = new Map(
    target.labels.filter((label) => !label.name.trim()).map((label) => [label.color, label]),
  );

  const mapLabel = (id: string): TrelloLabel | null => {
    const sourceLabel = sourceLabelById.get(id);
    if (!sourceLabel) return null;
    if (sourceLabel.name.trim()) {
      // Etiqueta nomeada só associa por nome: a mesma cor pode ter outro
      // significado no quadro de destino.
      return targetLabelByName.get(normalizeName(sourceLabel.name)) ?? null;
    }
    if (!sourceLabel.color) return null;
    // Etiqueta sem nome é apenas uma cor; aí a cor é a única identidade.
    return targetUnnamedLabelByColor.get(sourceLabel.color) ?? null;
  };

  const mapList = (sourceListId: string): string | null => {
    const sourceList = sourceListById.get(sourceListId);
    if (!sourceList) return null;
    return targetListByName.get(normalizeName(sourceList.name))?.id ?? null;
  };

  const rules: Rule[] = [];
  let skipped = 0;

  for (const rule of sourceRules) {
    let missing = false;

    let triggerListId: string | undefined;
    if (rule.trigger.listId) {
      const mapped = mapList(rule.trigger.listId);
      if (!mapped) missing = true;
      else triggerListId = mapped;
    }

    let triggerLabelIds: string[] | undefined;
    if (!missing && rule.trigger.labelIds && rule.trigger.labelIds.length > 0) {
      triggerLabelIds = [];
      for (const labelId of rule.trigger.labelIds) {
        const mapped = mapLabel(labelId);
        if (!mapped) {
          missing = true;
          break;
        }
        triggerLabelIds.push(mapped.id);
      }
    }

    const actions: RuleAction[] = [];
    for (const action of rule.actions) {
      if (missing) break;
      if (action.type === 'moveToList' && action.listId) {
        const mapped = mapList(action.listId);
        if (!mapped) {
          missing = true;
          break;
        }
        actions.push({ ...action, listId: mapped });
        continue;
      }
      if ((action.type === 'addLabel' || action.type === 'removeLabel') && action.labelId) {
        const mapped = mapLabel(action.labelId);
        if (!mapped) {
          missing = true;
          break;
        }
        actions.push({
          ...action,
          labelId: mapped.id,
          labelName: mapped.name || action.labelName,
        });
        continue;
      }
      actions.push({ ...action });
    }

    if (missing) {
      skipped += 1;
      continue;
    }

    rules.push({
      ...rule,
      id: newRuleId(),
      boardId: targetBoardId,
      trigger: {
        ...rule.trigger,
        listId: triggerListId,
        labelIds: rule.trigger.labelIds ? triggerLabelIds : undefined,
      },
      actions,
    });
  }

  return { rules, copied: rules.length, skipped };
}
