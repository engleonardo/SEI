import { browser } from 'wxt/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(async () => {
  await browser.storage.local.clear();
  vi.resetModules();
});

describe('modelos de checklist', () => {
  it('salva, ordena por nome e aplica a lista de itens', async () => {
    const { listChecklistTemplates, saveChecklistTemplate } = await import(
      './checklist-templates'
    );

    await saveChecklistTemplate({ name: 'Zeladoria', items: ['Conferir', 'Registrar'] });
    await saveChecklistTemplate({ name: 'Análise', items: ['Ler', 'Parecer'] });

    const templates = await listChecklistTemplates();
    expect(templates.map((template) => template.name)).toEqual(['Análise', 'Zeladoria']);
    expect(templates[0]?.items).toEqual(['Ler', 'Parecer']);
  });

  it('atualiza o modelo existente em vez de duplicar', async () => {
    const { listChecklistTemplates, saveChecklistTemplate } = await import(
      './checklist-templates'
    );

    const [first] = await saveChecklistTemplate({ name: 'Análise', items: ['Ler'] });
    await saveChecklistTemplate({ id: first?.id, name: 'Análise', items: ['Ler', 'Parecer'] });

    const templates = await listChecklistTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0]?.items).toEqual(['Ler', 'Parecer']);
  });

  it('remove o modelo e rejeita modelo sem itens', async () => {
    const { deleteChecklistTemplate, listChecklistTemplates, saveChecklistTemplate } = await import(
      './checklist-templates'
    );

    const [template] = await saveChecklistTemplate({ name: 'Análise', items: ['Ler'] });
    await expect(saveChecklistTemplate({ name: 'Vazio', items: [] })).rejects.toThrow();
    await deleteChecklistTemplate(template?.id ?? '');

    expect(await listChecklistTemplates()).toEqual([]);
  });
});
