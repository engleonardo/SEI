import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import type { Rule } from '../domain/rules';
import { exportBackup, importBackup } from './backup';
import { getRules, saveRules } from './rules';
import { getSettings, saveSettings } from './settings';

const rule: Rule = {
  id: 'rule-backup',
  name: 'Concluído vai para concluídos',
  enabled: true,
  boardId: 'board-1',
  trigger: { type: 'completed' },
  actions: [{ type: 'moveToTop' }],
};

beforeEach(async () => {
  await browser.storage.local.clear();
});

describe('backup das configurações', () => {
  it('exporta sem credenciais por padrão', async () => {
    await saveSettings({
      appKey: 'key',
      appToken: 'token',
      defaultBoardId: 'board-1',
      defaultBoardName: 'Quadro',
      defaultListId: 'list-1',
      defaultListName: 'Lista',
      theme: 'dark',
    });
    await saveRules([rule]);

    const backup = await exportBackup(false);

    expect(backup.app).toBe('sei-flow');
    expect(backup.rules).toHaveLength(1);
    expect(backup.settings.defaultBoardId).toBe('board-1');
    expect(backup.settings.theme).toBe('dark');
    expect(backup.settings.appKey).toBeUndefined();
    expect(backup.settings.appToken).toBeUndefined();
  });

  it('inclui credenciais quando solicitado', async () => {
    await saveSettings({ appKey: 'key', appToken: 'token' });
    const backup = await exportBackup(true);
    expect(backup.settings.appKey).toBe('key');
    expect(backup.settings.appToken).toBe('token');
  });

  it('importa regras e configurações preservando credenciais ausentes', async () => {
    await saveSettings({ appKey: 'key', appToken: 'token' });
    await saveRules([rule]);
    const backup = await exportBackup(false);

    await saveSettings({ defaultBoardId: 'outro', defaultBoardName: 'Outro', theme: 'light' });
    const result = await importBackup(backup);

    expect(result.rules).toBe(1);
    const settings = await getSettings();
    expect(settings.defaultBoardId).toBe(backup.settings.defaultBoardId);
    expect(settings.theme).toBe(backup.settings.theme);
    expect(settings.appKey).toBe('key');
    expect(settings.appToken).toBe('token');
  });

  it('importa as regras do backup', async () => {
    const backup = await exportBackup(false);
    const withRules = { ...backup, rules: [rule] };
    const result = await importBackup(withRules);
    expect(result.rules).toBe(1);
    expect((await getRules()).some((item) => item.id === 'rule-backup')).toBe(true);
  });

  it('rejeita conteúdo que não é do SEI Flow', async () => {
    await expect(importBackup({ app: 'outro' })).rejects.toThrow();
    await expect(importBackup(null)).rejects.toThrow();
  });
});
