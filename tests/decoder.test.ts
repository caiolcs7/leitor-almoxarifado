import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { parseScan } from '../src/core/parser';
import { defaultSettings } from '../src/core/models';
beforeAll(async () => {
  await prepareZXingModule({
    overrides: {
      wasmBinary: readFileSync(
        'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
      ),
    },
    fireImmediately: true,
  });
});
describe('ZXing-C++ actual image decoding', () => {
  it.each([
    ['product-ml', 'ML12345'],
    ['product-mpc', 'MPCABC01'],
    ['product-stc', 'STC003'],
    ['product-mpl', 'MPL012'],
  ])(
    'decodes and classifies Data Matrix from family %s',
    async (name, code) => {
      const result = await readBarcodes(
        new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
        { formats: ['DataMatrix'] },
      );
      expect(result).toHaveLength(1);
      expect(result[0].symbology).toBe('DataMatrix');
      expect(parseScan(result[0].text, defaultSettings.rules)).toMatchObject({
        valid: true,
        type: 'product',
        normalized: code,
      });
    },
  );
  it.each(['product', 'product-rotated', 'product-inverted'])(
    'decodes real Data Matrix fixture %s',
    async (name) => {
      const result = await readBarcodes(
        new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
        {
          formats: ['DataMatrix'],
          tryHarder: true,
          tryInvert: true,
          tryRotate: true,
        },
      );
      expect(result).toHaveLength(1);
      expect(result[0].symbology).toBe('DataMatrix');
      expect(result[0].text).toBe('ITPFPHM510ESAI4');
      expect(result[0].isValid).toBe(true);
    },
  );
  it('decodes an address Data Matrix', async () => {
    const result = await readBarcodes(
      new Uint8Array(readFileSync('tests/fixtures/address.png')),
      { formats: ['DataMatrix'] },
    );
    expect(result[0].text).toBe('R01A1C03DP02');
  });
  it('does not invent a reading from a blank image', async () =>
    expect(
      await readBarcodes(
        new Uint8Array(readFileSync('tests/fixtures/blank.png')),
        { formats: ['DataMatrix'] },
      ),
    ).toHaveLength(0));
  it.each([
    ['qr', 'QRCode'],
    ['code128', 'Code128'],
  ] as const)('also decodes %s', async (name, format) => {
    const result = await readBarcodes(
      new Uint8Array(readFileSync(`tests/fixtures/${name}.png`)),
      { formats: [format] },
    );
    expect(result[0].text).toBe('ITPFPHM510ESAI4');
  });
});
