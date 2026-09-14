import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? wasmUrl : prefix + path,
  },
});
type DecodeRequest = { id: number; input: Blob | ImageData };
self.onmessage = async ({ data }: MessageEvent<DecodeRequest>) => {
  try {
    const results = await readBarcodes(data.input, {
      formats: ['DataMatrix', 'QRCode', 'Code128', 'Code39', 'ITF'],
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      textMode: 'Plain',
      maxNumberOfSymbols: 4,
      returnErrors: false,
    });
    self.postMessage({
      id: data.id,
      values: results
        .filter((r) => r.isValid && r.text && r.sequenceSize <= 1)
        .map((r) => ({ text: r.text, format: r.format })),
    });
  } catch {
    self.postMessage({
      id: data.id,
      error:
        'Não foi possível decodificar a imagem. Verifique se o app terminou de preparar o modo offline e tente outra imagem.',
    });
  }
};
