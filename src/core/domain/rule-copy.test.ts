import { describe, expect, it } from 'vitest';
import { createRule, type Rule } from './rules';
import { copyRulesToBoard } from './rule-copy';
import type { TrelloLabel, TrelloList } from './types';

const lists: TrelloList[] = [
  { id: 'origem-a', name: 'A fazer' },
  { id: 'origem-b', name: 'Concluído' },
];
const labels: TrelloLabel[] = [
  { id: 'label-urgente', name: 'Urgente', color: 'red' },
  { id: 'label-sem-nome', name: '', color: 'sky' },
];

function rule(partial: Partial<Rule>): Rule {
  return createRule({
    id: 'regra-1',
    name: 'Regra',
    enabled: true,
    boardId: 'origem',
    trigger: { type: 'enterList', listId: 'origem-a' },
    actions: [{ type: 'moveToList', listId: 'origem-b' }],
    ...partial,
  });
}

describe('cópia de regras entre quadros', () => {
  it('associa listas e etiquetas pelo nome e gera novos ids', () => {
    const result = copyRulesToBoard(
      [
        rule({
          trigger: { type: 'enterList', listId: 'origem-a', labelIds: ['label-urgente'] },
          actions: [
            { type: 'moveToList', listId: 'origem-b' },
            { type: 'addLabel', labelId: 'label-urgente', labelName: 'Urgente' },
          ],
        }),
      ],
      { lists, labels },
      {
        lists: [
          { id: 'destino-a', name: '  a FAZER ' },
          { id: 'destino-b', name: 'Concluído' },
        ],
        labels: [{ id: 'destino-urgente', name: 'urgente', color: 'blue' }],
      },
      'destino',
    );

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(0);
    const [copied] = result.rules;
    expect(copied?.id).not.toBe('regra-1');
    expect(copied?.boardId).toBe('destino');
    expect(copied?.enabled).toBe(true);
    expect(copied?.trigger.listId).toBe('destino-a');
    expect(copied?.trigger.labelIds).toEqual(['destino-urgente']);
    expect(copied?.actions[0]).toMatchObject({ type: 'moveToList', listId: 'destino-b' });
    expect(copied?.actions[1]).toMatchObject({
      type: 'addLabel',
      labelId: 'destino-urgente',
      labelName: 'urgente',
    });
  });

  it('não associa etiqueta nomeada apenas pela cor', () => {
    const result = copyRulesToBoard(
      [rule({ trigger: { type: 'enterList', labelIds: ['label-urgente'] } })],
      { lists, labels },
      {
        lists: [...lists],
        labels: [{ id: 'destino-cancelado', name: 'Cancelado', color: 'red' }],
      },
      'destino',
    );

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('associa etiqueta sem nome pela cor', () => {
    const result = copyRulesToBoard(
      [rule({ trigger: { type: 'enterList', labelIds: ['label-sem-nome'] } })],
      { lists, labels },
      {
        lists: [...lists],
        labels: [
          { id: 'destino-azul', name: '', color: 'sky' },
          { id: 'destino-vermelho', name: 'Outra', color: 'red' },
        ],
      },
      'destino',
    );

    expect(result.copied).toBe(1);
    expect(result.rules[0]?.trigger.labelIds).toEqual(['destino-azul']);
  });

  it('ignora a regra quando a lista não existe no destino', () => {
    const result = copyRulesToBoard(
      [rule({ actions: [{ type: 'moveToList', listId: 'origem-b' }] })],
      { lists, labels },
      {
        lists: [{ id: 'destino-a', name: 'A fazer' }],
        labels: [],
      },
      'destino',
    );

    expect(result.copied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('copia regras sem lista/etiqueta e preserva o restante', () => {
    const result = copyRulesToBoard(
      [
        rule({
          trigger: { type: 'created' },
          actions: [{ type: 'moveToTop' }, { type: 'addComment', text: 'Olá {processo}' }],
          requiresSeiLink: false,
        }),
      ],
      { lists, labels },
      { lists: [], labels: [] },
      'destino',
    );

    expect(result.copied).toBe(1);
    expect(result.rules[0]?.trigger.listId).toBeUndefined();
    expect(result.rules[0]?.actions).toEqual([
      { type: 'moveToTop' },
      { type: 'addComment', text: 'Olá {processo}' },
    ]);
    expect(result.rules[0]?.requiresSeiLink).toBe(false);
  });
});
