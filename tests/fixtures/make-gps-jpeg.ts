// Regenerates the gallery fixture `content/photos/anza-borrego/a.jpg`: a dusk gradient whose EXIF
// carries a GPS position (Font's Point, Anza-Borrego), so photos.test.ts can prove the build never
// publishes it. The output is committed; rerun only to change the fixture:
//
//   node --experimental-strip-types tests/fixtures/make-gps-jpeg.ts
import { join } from 'node:path';
import sharp from 'sharp';

const out = join(import.meta.dirname, 'content/photos/anza-borrego/a.jpg');

const dusk = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <linearGradient id="dusk" x2="1" y2="1">
    <stop offset="0" stop-color="#d0895b" />
    <stop offset="1" stop-color="#3c3f6c" />
  </linearGradient>
  <rect width="100%" height="100%" fill="url(#dusk)" />
</svg>`;

await sharp(Buffer.from(dusk))
  .withExif({
    IFD3: {
      // Degrees, minutes, seconds as EXIF rationals: 33°15'17" N, 116°13'9" W.
      GPSLatitudeRef: 'N',
      GPSLatitude: '33/1 15/1 17/1',
      GPSLongitudeRef: 'W',
      GPSLongitude: '116/1 13/1 9/1',
    },
  })
  .jpeg({ quality: 80 })
  .toFile(out);
