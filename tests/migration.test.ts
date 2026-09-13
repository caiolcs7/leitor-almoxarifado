import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { InventoryDatabase } from '../src/core/database';
import {
  defaultSettings,
  type Session,
  type InventoryRecord,
} from '../src/core/models';
import { parseScan } from '../src/core/parser';

describe('upgrade from the published database v1', () => {
  it.each([
    {
      name: 'original IT default',
      patterns: ['^IT[A-Z0-9]{3,62}$'],
      expand: true,
    },
    {
      name: 'custom product rules',
      patterns: ['^MPC[A-Z0-9]{1,64}$'],
      expand: false,
    },
  ])(
    'preserves inventory and preferences with $name',
    async ({ patterns, expand }) => {
      const name = `migration-${crypto.randomUUID()}`;
      const legacy = new Dexie(name);
      // This is the schema shipped before the multi-prefix release.
      legacy.version(1).stores({
        sessions: 'id, updatedAt, status',
        records: 'id, sessionId, [sessionId+order], [sessionId+code+address]',
        settings: 'id',
        history: 'id, sessionId, [sessionId+timestamp]',
      });
      const settings = structuredClone(defaultSettings);
      settings.rules.productPatterns = patterns;
      settings.rules.padB = true;
      settings.rules.wrappers = [{ prefix: '251', suffix: '371' }];
      settings.theme = 'dark';
      settings.sound = false;
      const session: Session = {
        id: crypto.randomUUID(),
        name: 'Rua R01 preservada',
        createdAt: 1,
        updatedAt: 2,
        status: 'active',
        notes: 'Conferência em andamento',
        count: 1,
        nextOrder: 2,
        activeAddress: 'R01A1C02DP01',
        mode: 'product-address',
        pending: { type: 'product', value: 'ITABC02', source: 'hid' },
        completedAddresses: ['R01A1C01DP01'],
      };
      const record: InventoryRecord = {
        id: crypto.randomUUID(),
        sessionId: session.id,
        code: 'ITABC01',
        address: 'R01A1C02DP01',
        timestamp: 2,
        order: 1,
        source: 'hid',
      };
      await legacy.table('settings').put(settings);
      await legacy.table('sessions').put(session);
      await legacy.table('records').put(record);
      legacy.close();

      const updated = new InventoryDatabase(name);
      try {
        await updated.open();
        expect(updated.verno).toBe(2);
        expect(await updated.sessions.get(session.id)).toEqual(session);
        expect(await updated.records.get(record.id)).toEqual(record);
        const saved = (await updated.settings.get('main'))!;
        expect(saved).toEqual({
          ...settings,
          rules: {
            ...settings.rules,
            productPatterns: expand
              ? defaultSettings.rules.productPatterns
              : patterns,
          },
        });
        expect(parseScan('ML12345', saved.rules).valid).toBe(expand);
        expect(parseScan('MPCABC01', saved.rules).type).toBe('product');
        updated.close();
        await updated.open();
        expect(await updated.records.count()).toBe(1);
      } finally {
        await updated.delete();
      }
    },
  );
});
