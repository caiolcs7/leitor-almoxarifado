import { expect, it } from 'vitest';
import { ScanGate } from '../src/core/scan-gate';
it('suppresses continuously visible codes even after many seconds', () => {
  const gate = new ScanGate();
  expect(gate.accept('IT123', 0)).toBe(true);
  for (let t = 100; t < 20000; t += 100)
    expect(gate.accept('IT123', t)).toBe(false);
});
it('rearms after genuine absence, but not short missed frames', () => {
  const gate = new ScanGate();
  gate.accept('IT123', 0);
  gate.absent(300);
  expect(gate.accept('IT123', 350)).toBe(false);
  gate.absent(1400);
  expect(gate.accept('IT123', 1500)).toBe(true);
});
it('allows another code and an intentional return', () => {
  const gate = new ScanGate();
  expect(gate.accept('A', 0)).toBe(true);
  expect(gate.accept('B', 100)).toBe(true);
  expect(gate.accept('A', 200)).toBe(true);
});
it('never repeats just because a slow frame took longer to decode', () => {
  const gate = new ScanGate();
  gate.accept('A', 0);
  expect(gate.accept('A', 2000)).toBe(false);
});
