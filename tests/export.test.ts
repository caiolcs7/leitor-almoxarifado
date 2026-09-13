import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  createWorkbook,
  createCsv,
  defaultExport,
  reportFilename,
} from '../src/services/export';
import type { InventoryRecord, Session } from '../src/core/models';
const session: Session = {
  id: crypto.randomUUID(),
  name: 'Teste R01',
  createdAt: 1789210800000,
  updatedAt: 1789210800000,
  status: 'active',
  notes: 'Não exportar em coluna',
  count: 3,
  nextOrder: 4,
  activeAddress: 'R01A1C04DP02',
  mode: 'fixed',
  pending: null,
  completedAddresses: [],
};
const rows: InventoryRecord[] = [
  ['ITPFPHM510ESAI4', 'R01A1C03DP02'],
  ['ITPRCSEM03AI4', 'R01A1C03DP02'],
  ['ITARSRM003AI4', 'R01A1C04DP02'],
].map(([code, address], i) => ({
  id: crypto.randomUUID(),
  sessionId: session.id,
  code,
  address,
  order: i + 1,
  timestamp: session.createdAt,
  source: 'hid',
}));
describe('real XLSX output', () => {
  it('writes and opens an actual workbook with exactly two business columns', async () => {
    const buffer = await createWorkbook(session, rows).xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    const sheet = loaded.getWorksheet('Todos os registros')!;
    expect(sheet).toBeDefined();
    expect(sheet.columnCount).toBe(2);
    expect(sheet.getRow(5).values).toEqual([
      undefined,
      'Código do Produto',
      'Endereço',
    ]);
    expect(sheet.rowCount).toBe(8);
    expect(
      [6, 7, 8].map((n) => [
        sheet.getCell(`A${n}`).value,
        sheet.getCell(`B${n}`).value,
      ]),
    ).toEqual(rows.map((r) => [r.code, r.address]));
    expect(sheet.getCell('A1').isMerged).toBe(true);
    expect(sheet.getCell('A5').font.bold).toBe(true);
    expect(sheet.getCell('A6').numFmt).toBe('@');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
    expect(sheet.autoFilter).toBe('A5:B8');
    expect(sheet.pageSetup.fitToWidth).toBe(1);
  });
  it('supports street sheets and export ordering without mutating records', () => {
    const workbook = createWorkbook(
      session,
      [
        ...rows,
        { ...rows[0], id: crypto.randomUUID(), address: 'R14B077', order: 4 },
      ],
      { ...defaultExport, sort: 'code', splitStreets: true },
    );
    expect(workbook.worksheets.map((w) => w.name)).toEqual([
      'Todos os registros',
      'R01',
      'R14',
    ]);
    expect(
      workbook.getWorksheet('Todos os registros')!.getCell('A6').value,
    ).toBe('ITARSRM003AI4');
    expect(rows[0].code).toBe('ITPFPHM510ESAI4');
  });
  it('writes valid empty session workbook', async () => {
    const workbook = createWorkbook({ ...session, count: 0 }, []);
    expect(workbook.worksheets[0].columnCount).toBe(2);
    expect((await workbook.xlsx.writeBuffer()).byteLength).toBeGreaterThan(
      1000,
    );
  });
  it('sanitizes filenames and makes CSV with two columns', () => {
    expect(reportFilename({ ...session, name: 'Teste / R01 : *' })).not.toMatch(
      /[/\\:*?<>|]/,
    );
    const csv = createCsv(rows, 'order');
    expect(csv).toContain('"Código do Produto";"Endereço"');
    expect(csv.split('\r\n')).toHaveLength(4);
  });
});
