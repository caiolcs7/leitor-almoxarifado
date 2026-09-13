import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/core/models';
import {
  cleanText,
  extractStreet,
  parseScan,
  validatePattern,
} from '../src/core/parser';
const rules = defaultSettings.rules;
describe('central parser', () => {
  it.each(['ITPFPHM510ESAI4', 'ITPRCSEM03AI4', 'ITARSRM003AI4'])(
    'classifies product %s',
    (value) =>
      expect(parseScan(value, rules)).toMatchObject({
        valid: true,
        type: 'product',
        normalized: value,
      }),
  );
  it.each(['R01A1C03DP02', 'R14B77', 'R14B077'])(
    'preserves address %s',
    (value) =>
      expect(parseScan(value, rules)).toMatchObject({
        valid: true,
        type: 'address',
        normalized: value,
      }),
  );
  it('normalizes whitespace, case and Unicode', () =>
    expect(parseScan('  ｉｔpfphm510esai4 \r\n', rules).normalized).toBe(
      'ITPFPHM510ESAI4',
    ));
  it('removes controls and invisibles', () =>
    expect(
      parseScan('\u001d\u001e\u0002ITPF\u200bPHM510ESAI4\u0003', rules)
        .normalized,
    ).toBe('ITPFPHM510ESAI4'));
  it('handles controls before an AIM identifier', () =>
    expect(parseScan('\u0002]d2ITPFPHM510ESAI4\u0003', rules).normalized).toBe(
      'ITPFPHM510ESAI4',
    ));
  it.each([']d1', ']d2', ']Q3', ']C1'])(
    'strips recognized AIM prefix %s',
    (prefix) =>
      expect(parseScan(prefix + 'ITPFPHM510ESAI4', rules).type).toBe('product'),
  );
  it.each([
    'RANDOM',
    'R14',
    'R14B',
    'ITPF...',
    'https://example.com',
    '',
    'IT🙈123',
  ])('rejects unknown/incomplete %s', (value) =>
    expect(parseScan(value, rules).valid).toBe(false),
  );
  it('does not remove numeric artifacts without configured rule', () =>
    expect(parseScan('251ITPFPHM510ESAI4371', rules).valid).toBe(false));
  it('unwraps only a complete configured wrapper', () => {
    const configured = {
      ...rules,
      wrappers: [{ prefix: '251', suffix: '371' }],
    };
    expect(parseScan('251ITPFPHM510ESAI4371', configured).normalized).toBe(
      'ITPFPHM510ESAI4',
    );
    expect(parseScan('251ITPFPHM510ESAI4', configured).valid).toBe(false);
  });
  it('does not change legitimate numeric endings', () =>
    expect(
      parseScan('IT251ABC371', {
        ...rules,
        wrappers: [{ prefix: '251', suffix: '371' }],
      }).normalized,
    ).toBe('IT251ABC371'));
  it('rejects ambiguous valid original and payload', () =>
    expect(
      parseScan('251ITABC371', {
        ...rules,
        productPatterns: ['^[A-Z0-9]{3,64}$'],
        wrappers: [{ prefix: '251', suffix: '371' }],
      }),
    ).toMatchObject({ valid: false, type: 'unknown' }));
  it('rejects overlapping product/address rules', () =>
    expect(
      parseScan('R14B77', { ...rules, productPatterns: ['^[A-Z0-9]{3,64}$'] })
        .valid,
    ).toBe(false));
  it('pads B only when enabled and only for simple addresses', () => {
    expect(parseScan('R14B77', rules).normalized).toBe('R14B77');
    expect(parseScan('R14B77', { ...rules, padB: true }).normalized).toBe(
      'R14B077',
    );
    expect(parseScan('R01A1C03DP02', { ...rules, padB: true }).normalized).toBe(
      'R01A1C03DP02',
    );
  });
  it.each([
    ['R01A1C03DP02', 'R01'],
    ['R14B077', 'R14'],
    ['SETORA', 'Sem rua'],
  ])('extracts street without mutation', (value, street) =>
    expect(extractStreet(value)).toBe(street),
  );
  it.each(['(a+)+$', '^A.*$', '^A[0-9]{1,999999}$', 'IT'])(
    'rejects unsafe rule %s',
    (pattern) => expect(validatePattern(pattern)).toBe(false),
  );
  it('limits payload lengths', () =>
    expect(parseScan('IT' + 'A'.repeat(3000), rules).valid).toBe(false));
  it('normalizes query', () => expect(cleanText(' it pf ')).toBe('ITPF'));
});
