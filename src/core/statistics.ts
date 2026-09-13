import type { InventoryRecord, Settings } from './models';
import { extractStreet, parseScan } from './parser';
export function statistics(records: InventoryRecord[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of records) {
    const key = `${row.code}\0${row.address}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  return {
    total: records.length,
    addresses: new Set(records.map((r) => r.address)).size,
    streets: new Set(records.map((r) => extractStreet(r.address))).size,
    duplicates,
  };
}
export function reviewIssues(records: InventoryRecord[], settings: Settings) {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = `${r.code}\0${r.address}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return records
    .map((record) => ({
      record,
      reasons: [
        ...((counts.get(`${record.code}\0${record.address}`) ?? 0) > 1
          ? ['Possível duplicado']
          : []),
        ...(record.source === 'manual' ? ['Registro manual ou editado'] : []),
        ...(parseScan(record.address, settings.rules).type !== 'address'
          ? ['Endereço fora do padrão atual']
          : []),
        ...(parseScan(record.code, settings.rules).type !== 'product'
          ? ['Código fora do padrão atual']
          : []),
      ],
    }))
    .filter((issue) => issue.reasons.length);
}
