import { beforeEach, afterAll, describe, expect, it } from 'vitest';
import {
  db,
  initializeDatabase,
  clearAllData,
  createSession,
  duplicateSession,
  deleteSession,
  removeRecords,
  restoreRecords,
  updateSession,
} from '../src/core/database';
import { defaultSettings } from '../src/core/models';
import {
  addManual,
  confirmDuplicate,
  editRecords,
  processScan,
} from '../src/core/scan-engine';
import {
  createBackup,
  importBackup,
  validateBackup,
} from '../src/services/backup';
const settings = defaultSettings;
beforeEach(async () => {
  await initializeDatabase();
  await clearAllData();
});
afterAll(() => db.close());
async function setup() {
  return createSession('Teste R01', 'fixed');
}
describe('durable sessions and scan state machine', () => {
  it.each(['fixed', 'product-address', 'address-product'] as const)(
    'requires address approval and preserves stored records in %s',
    async (mode) => {
      const session = await createSession('Troca protegida', mode);
      await db.sessions.update(session.id, {
        activeAddress: 'R14B77',
        pending:
          mode === 'product-address'
            ? { type: 'product', value: 'ML12345', source: 'camera' }
            : null,
      });
      const before = await db.sessions.get(session.id);
      const request = await processScan(
        session.id,
        'R14B78',
        'camera',
        settings,
      );
      expect(request.kind).toBe('address-change');
      expect(await db.sessions.get(session.id)).toEqual(before);
      expect(await db.records.count()).toBe(0);
      const accepted = await processScan(
        session.id,
        'R14B78',
        'camera',
        settings,
        request.addressChange,
      );
      expect(accepted.kind).toBe(
        mode === 'fixed'
          ? 'address'
          : mode === 'product-address'
            ? 'product'
            : 'waiting',
      );
      if (mode === 'address-product')
        await processScan(session.id, 'ML12345', 'camera', settings);
      expect((await db.sessions.get(session.id))?.activeAddress).toBe('R14B78');
      await expect(
        processScan(
          session.id,
          'R14B78',
          'camera',
          settings,
          request.addressChange,
        ),
      ).rejects.toThrow('mudou');
    },
  );
  it('old backups default to button capture and preserve continuous preference in new backups', async () => {
    const backup = await createBackup();
    const old = JSON.parse(JSON.stringify(backup));
    delete old.settings.cameraCapture;
    expect(validateBackup(old).settings.cameraCapture).toBe('button');
    backup.settings.cameraCapture = 'continuous';
    await importBackup(backup, true);
    expect((await db.settings.get('main'))?.cameraCapture).toBe('continuous');
  });
  it('restores legacy backup settings without bringing back the IT-only default', async () => {
    const session = await setup();
    await processScan(session.id, 'R01A1C02DP01', 'hid', settings);
    await processScan(session.id, 'ITABC01', 'hid', settings);
    const backup = await createBackup();
    backup.settings.rules.productPatterns = ['^IT[A-Z0-9]{3,62}$'];
    backup.settings.sound = false;
    await importBackup(backup, true);
    const restored = (await db.settings.get('main'))!;
    expect(restored.sound).toBe(false);
    expect(
      await processScan(session.id, 'Ml12345', 'hid', restored),
    ).toMatchObject({
      kind: 'product',
      record: { code: 'ML12345', address: 'R01A1C02DP01' },
    });
    expect(await db.records.count()).toBe(3);
  });
  it('implements the complete required acceptance sequence', async () => {
    const s = await setup();
    for (const code of [
      'R01A1C03DP02',
      'ITPFPHM510ESAI4',
      'ITPRCSEM03AI4',
      'R01A1C04DP02',
      'ITARSRM003AI4',
    ]) {
      const result = await processScan(s.id, code, 'hid', settings);
      if (result.addressChange)
        await processScan(s.id, code, 'hid', settings, result.addressChange);
    }
    const rows = await db.records
      .where('sessionId')
      .equals(s.id)
      .sortBy('order');
    expect(rows.map((r) => [r.code, r.address])).toEqual([
      ['ITPFPHM510ESAI4', 'R01A1C03DP02'],
      ['ITPRCSEM03AI4', 'R01A1C03DP02'],
      ['ITARSRM003AI4', 'R01A1C04DP02'],
    ]);
    db.close();
    await db.open();
    expect(await db.sessions.get(s.id)).toMatchObject({
      count: 3,
      activeAddress: 'R01A1C04DP02',
      nextOrder: 4,
    });
    expect(await db.records.count()).toBe(3);
  });
  it('never adds a product without an address', async () => {
    const s = await setup();
    expect(
      (await processScan(s.id, 'ITPFPHM510ESAI4', 'camera', settings)).kind,
    ).toBe('error');
    expect(await db.records.count()).toBe(0);
  });
  it('serializes simultaneous reads without losing counts or orders', async () => {
    const s = await setup();
    await processScan(s.id, 'R14B77', 'hid', settings);
    await Promise.all(
      ['ITPROD1', 'ITPROD2', 'ITPROD3'].map((code) =>
        processScan(s.id, code, 'hid', settings),
      ),
    );
    expect((await db.sessions.get(s.id))?.count).toBe(3);
    expect(new Set((await db.records.toArray()).map((r) => r.order)).size).toBe(
      3,
    );
  });
  it('confirms legitimate duplicates explicitly', async () => {
    const s = await setup();
    await processScan(s.id, 'R14B77', 'hid', settings);
    await processScan(s.id, 'ITPROD1', 'hid', settings);
    const repeat = await processScan(s.id, 'ITPROD1', 'hid', settings);
    expect(repeat.kind).toBe('duplicate');
    expect(await db.records.count()).toBe(1);
    await confirmDuplicate(repeat.duplicate!, settings);
    expect(await db.records.count()).toBe(2);
  });
  it.each(['product-address', 'address-product'] as const)(
    'supports paired mode %s and preserves pending pair on reopening',
    async (mode) => {
      const s = await createSession('Par', mode);
      const values =
        mode === 'product-address'
          ? ['ITPROD1', 'R14B77']
          : ['R14B77', 'ITPROD1'];
      expect((await processScan(s.id, values[0], 'hid', settings)).kind).toBe(
        'waiting',
      );
      db.close();
      await db.open();
      expect((await db.sessions.get(s.id))?.pending?.value).toBe(values[0]);
      expect((await processScan(s.id, values[1], 'hid', settings)).kind).toBe(
        'product',
      );
      expect((await db.records.toArray())[0]).toMatchObject({
        code: 'ITPROD1',
        address: 'R14B77',
      });
      expect((await db.sessions.get(s.id))?.pending).toBe(null);
    },
  );
  it('does not overwrite an incomplete pair with another same-type scan', async () => {
    const s = await createSession('Par', 'product-address');
    await processScan(s.id, 'ITPROD1', 'hid', settings);
    expect((await processScan(s.id, 'ITPROD2', 'hid', settings)).kind).toBe(
      'error',
    );
    expect((await db.sessions.get(s.id))?.pending?.value).toBe('ITPROD1');
  });
  it('accepts unrestricted and special manual inputs, batch edits, undo and restoration', async () => {
    const s = await setup();
    await addManual(s.id, 'ITP...', 'R14B77', settings);
    await addManual(s.id, 'itprod1', 'r14b77', settings);
    await addManual(s.id, 'ITPROD2', 'R14B77', settings);
    await addManual(s.id, 'SEM CODIGO', 'R14B77', settings);
    await addManual(s.id, 'VAZIO', 'R14B77', settings);
    const rows = await db.records.toArray();
    expect(rows.map((row) => row.code)).toEqual(
      expect.arrayContaining(['ITP...', 'SEM CODIGO', 'VAZIO']),
    );
    await editRecords(
      s.id,
      rows.map((r) => r.id),
      'R01A1C03DP02',
      settings,
    );
    expect(
      (await db.records.toArray()).every((r) => r.address === 'R01A1C03DP02'),
    ).toBe(true);
    const removed = await removeRecords(s.id, [rows[0].id]);
    expect((await db.sessions.get(s.id))?.count).toBe(4);
    await restoreRecords(removed);
    await restoreRecords(removed);
    expect((await db.sessions.get(s.id))?.count).toBe(5);
  });
  it('duplicates, archives, renames and deletes sessions independently', async () => {
    const s = await setup();
    await addManual(s.id, 'ITPROD1', 'R14B77', settings);
    const copy = await duplicateSession(s.id);
    await updateSession(s.id, { name: 'Renomeado', status: 'archived' });
    await expect(
      processScan(s.id, 'ITPROD2', 'hid', settings),
    ).rejects.toThrow();
    await deleteSession(s.id);
    expect(await db.records.count()).toBe(1);
    expect((await db.sessions.get(copy.id))?.count).toBe(1);
  });
  it('keeps raw scans only on explicit setting', async () => {
    const s = await setup();
    await addManual(s.id, ' itprod1 ', 'R14B77', settings);
    await addManual(s.id, ' itprod2 ', 'R14B77', {
      ...settings,
      saveRaw: true,
    });
    const rows = await db.records.orderBy('id').toArray();
    expect(rows.find((r) => r.code === 'ITPROD1')?.rawScan).toBeUndefined();
    expect(rows.find((r) => r.code === 'ITPROD2')?.rawScan).toBe(' itprod2 ');
  });
});
describe('backup validation and additive restore', () => {
  it('restores to new ids without overwriting existing sessions', async () => {
    const s = await setup();
    await addManual(s.id, 'ITPROD1', 'R14B77', settings);
    const backup = await createBackup();
    await importBackup(backup, false);
    expect(await db.sessions.count()).toBe(2);
    expect(await db.records.count()).toBe(2);
    expect(await db.records.where('sessionId').equals(s.id).count()).toBe(1);
  });
  it('rejects malformed and orphan data atomically', async () => {
    expect(() => validateBackup({})).toThrow();
    const s = await setup();
    await addManual(s.id, 'ITPROD1', 'R14B77', settings);
    const backup = await createBackup();
    backup.records[0].sessionId = crypto.randomUUID();
    await expect(importBackup(backup, false)).rejects.toThrow();
    expect(await db.records.count()).toBe(1);
  });
  it('rejects duplicate identifiers and invalid settings', async () => {
    const s = await setup();
    const backup = await createBackup();
    backup.sessions.push(s);
    expect(() => validateBackup(backup)).toThrow();
  });
});
