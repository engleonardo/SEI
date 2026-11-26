import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRule } from '../domain/rules';

beforeEach(async () => {
  await browser.storage.local.clear();
  vi.resetModules();
});

describe('storage de regras', () => {
  it('preserva os espaços do comentário ao salvar e recarregar', async () => {
    const { getRules, saveRules } = await import('./rules');
    const rule = createRule({
      actions: [{ type: 'addComment', text: 'Conclusão 1 em: {data} — processo {processo}' }],
    });

    await saveRules([rule]);
    const [stored] = await getRules();

    expect(stored?.actions[0]?.text).toBe('Conclusão 1 em: {data} — processo {processo}');
  });

  it('mantém o modelo de checklist e limpa um identificador em branco', async () => {
    const { getRules, saveRules } = await import('./rules');
    const rule = createRule({
      actions: [
        { type: 'applyChecklist', templateId: 'checklist_1' },
        { type: 'applyChecklist', templateId: '   ' },
      ],
    });

    await saveRules([rule]);
    const [stored] = await getRules();

    expect(stored?.actions).toHaveLength(2);
    expect(stored?.actions[0]?.templateId).toBe('checklist_1');
    expect(stored?.actions[1]?.templateId).toBeUndefined();
  });

  it('descarta um comentário só com espaços', async () => {
    const { getRules, saveRules } = await import('./rules');
    const rule = createRule({ actions: [{ type: 'addComment', text: '   ' }] });

    await saveRules([rule]);
    const [stored] = await getRules();

    expect(stored?.actions[0]?.text).toBeUndefined();
  });
});
