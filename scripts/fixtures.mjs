import bwipjs from 'bwip-js';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('tests/fixtures', { recursive: true });
const examples = {
  address: 'R01A1C03DP02',
  address2: 'R01A1C04DP02',
  product: 'ITPFPHM510ESAI4',
  product2: 'ITPRCSEM03AI4',
  product3: 'ITARSRM003AI4',
  'product-ml': 'ML12345',
  'product-mpc': 'MPCABC01',
  'product-stc': 'STC003',
  'product-mpl': 'MPL012',
  bombona: 'R14B77',
};
for (const [name, text] of Object.entries(examples)) {
  const buffer = await bwipjs.toBuffer({
    bcid: 'datamatrix',
    text,
    scale: 6,
    padding: 10,
    backgroundcolor: 'FFFFFF',
  });
  await writeFile(`tests/fixtures/${name}.png`, buffer);
  if (name === 'product') {
    await sharp(buffer)
      .rotate(90)
      .png()
      .toFile('tests/fixtures/product-rotated.png');
    await sharp(buffer)
      .negate({ alpha: false })
      .png()
      .toFile('tests/fixtures/product-inverted.png');
    const gray = await sharp(buffer)
      .resize(640, 480, {
        fit: 'contain',
        background: '#ffffff',
        kernel: 'nearest',
      })
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer();
    const y = Buffer.from(
      gray.map((value) => Math.round(16 + (value * 219) / 255)),
    );
    const chroma = Buffer.alloc((640 * 480) / 2, 128);
    await writeFile(
      'tests/fixtures/product.y4m',
      Buffer.concat([
        Buffer.from('YUV4MPEG2 W640 H480 F5:1 Ip A1:1 C420jpeg\nFRAME\n'),
        y,
        chroma,
      ]),
    );
  }
}
await sharp({
  create: { width: 480, height: 320, channels: 3, background: '#ffffff' },
})
  .png()
  .toFile('tests/fixtures/blank.png');
await writeFile(
  'tests/fixtures/qr.png',
  await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: examples.product,
    scale: 6,
    padding: 10,
    backgroundcolor: 'FFFFFF',
  }),
);
await writeFile(
  'tests/fixtures/code128.png',
  await bwipjs.toBuffer({
    bcid: 'code128',
    text: examples.product,
    scale: 3,
    height: 15,
    padding: 10,
    backgroundcolor: 'FFFFFF',
  }),
);
