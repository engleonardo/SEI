import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { getProcessCatalog, listProcessRecords, upsertProcessRecords } from './processes';

const PROCESS = '08660.018176/2014-60';
const OTHER = '12345.678901/2025-12';

beforeEach(async () => {
  await browser.storage.local.clear();
});

describe('catálogo de processos do SEI', () => {
  it('grava e mescla metadados sem perder campos já conhecidos', async () => {
    await upsertProcessRecords([
      {
        number: PROCESS,
        specification: 'Aquisição de material',
        processType: 'Processo Administrativo',
        url: 'http://sei.test/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=1',
        origin: 'http://sei.test',
        unread: true,
      },
    ]);

    let catalog = await getProcessCatalog();
    expect(catalog[PROCESS]).toMatchObject({
      number: PROCESS,
      specification: 'Aquisição de material',
      processType: 'Processo Administrativo',
      origin: 'http://sei.test',
      unread: true,
    });

    await upsertProcessRecords([{ number: PROCESS, unread: false }]);
    catalog = await getProcessCatalog();
    expect(catalog[PROCESS]).toMatchObject({
      specification: 'Aquisição de material',
      processType: 'Processo Administrativo',
      unread: false,
    });
  });

  it('ignora números inválidos e URLs que não são http(s)', async () => {
    const result = await upsertProcessRecords([
      { number: 'abc', specification: 'Inválido' },
      { number: OTHER, url: 'javascript:alert(1)', origin: 'http://sei.test' },
    ]);
    expect(result.total).toBe(1);
    const records = await listProcessRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      number: OTHER,
      url: '',
      origin: 'http://sei.test',
      unread: false,
    });
  });

  it('não regrava quando nada mudou', async () => {
    const input = {
      number: PROCESS,
      specification: 'Aquisição',
      processType: 'Processo Administrativo',
      url: 'http://sei.test/x',
      origin: 'http://sei.test',
      unread: true,
    };
    expect((await upsertProcessRecords([input])).updated).toBe(1);
    expect((await upsertProcessRecords([input])).updated).toBe(0);
  });
});
