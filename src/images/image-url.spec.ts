import { createHash } from 'crypto';

import {
  imageVersion,
  parseImageDataUrl,
  withImageRefUrl,
  withImageUrl,
} from './image-url.js';

describe('parseImageDataUrl', () => {
  it.each([
    ['data:image/png;base64,iVBORw0KGgo=', 'image/png', 'png'],
    ['data:image/jpeg;base64,/9j/4AAQ', 'image/jpeg', 'jpg'],
    ['data:image/webp;base64,UklGRg==', 'image/webp', 'webp'],
    ['data:image/svg+xml;base64,PHN2Zz4=', 'image/svg+xml', 'svg'],
  ])('%s 是 %s，副檔名 %s', (dataUrl, mimeType, extension) => {
    expect(parseImageDataUrl(dataUrl)).toMatchObject({ mimeType, extension });
  });

  it.each([
    'data:text/html;base64,PGgxPg==',
    'data:image/bmp;base64,Qk0=',
    'data:image/png,iVBORw0KGgo',
    'https://example.com/a.png',
    'banner',
  ])('%s 不是可提供的圖片', (dataUrl) => {
    expect(parseImageDataUrl(dataUrl)).toBeNull();
  });
});

describe('imageVersion', () => {
  it('是圖片內容 SHA-256 的前 16 個十六進位字元', () => {
    const image = 'data:image/webp;base64,UklGRg==';

    expect(imageVersion(image)).toBe(
      createHash('sha256').update(image).digest('hex').slice(0, 16),
    );
    expect(imageVersion(image)).toMatch(/^[\da-f]{16}$/);
  });

  it('只有圖片內容不同時才不同', () => {
    expect(imageVersion('data:image/png;base64,AA==')).toBe(
      imageVersion('data:image/png;base64,AA=='),
    );
    expect(imageVersion('data:image/png;base64,AA==')).not.toBe(
      imageVersion('data:image/png;base64,AB=='),
    );
  });
});

describe('withImageUrl', () => {
  const updatedAt = new Date('2026-11-05T04:00:00.123Z');
  const image = 'data:image/webp;base64,UklGRg==';

  it('以圖片內容的雜湊當版本，並拿掉原本的 image', () => {
    expect(
      withImageUrl('menuItem', {
        id: 'item-1',
        image,
        updatedAt,
        name: 'Latte',
      }),
    ).toEqual({
      id: 'item-1',
      imageUrl: `/api/images/menuItem/item-1/${imageVersion(image)}.webp`,
      updatedAt,
      name: 'Latte',
    });
  });

  it('只改 updatedAt 時網址不變', () => {
    expect(
      withImageUrl('banner', { id: 'banner-1', image, updatedAt }).imageUrl,
    ).toBe(
      withImageUrl('banner', {
        id: 'banner-1',
        image,
        updatedAt: new Date('2026-11-06T00:00:00Z'),
      }).imageUrl,
    );
  });

  it('https 網址原樣當成 imageUrl', () => {
    const url = 'https://images.example.com/banner/0123456789abcdef.webp';

    expect(withImageUrl('banner', { id: 'banner-1', image: url })).toEqual({
      id: 'banner-1',
      imageUrl: url,
    });
  });

  it.each([null, 'banner'])('image 為 %j 時 imageUrl 為 null', (image) => {
    expect(
      withImageUrl('banner', { id: 'banner-1', image }).imageUrl,
    ).toBeNull();
  });
});

describe('withImageRefUrl', () => {
  it('組出和 withImageUrl 相同的網址，並拿掉 imageRef', () => {
    const image = 'data:image/webp;base64,UklGRg==';

    expect(
      withImageRefUrl('menuItem', {
        id: 'item-1',
        imageRef: `image/webp ${imageVersion(image)}`,
        name: 'Latte',
      }),
    ).toEqual(withImageUrl('menuItem', { id: 'item-1', image, name: 'Latte' }));
  });

  it('https 網址原樣當成 imageUrl', () => {
    const url = 'https://images.example.com/menu/0123456789abcdef.png';

    expect(withImageRefUrl('menu', { id: 'menu-1', imageRef: url })).toEqual({
      id: 'menu-1',
      imageUrl: url,
    });
  });

  it.each([null, 'image/bmp 0123456789abcdef', 'image/png'])(
    'imageRef 為 %j 時 imageUrl 為 null',
    (imageRef) => {
      expect(
        withImageRefUrl('menu', { id: 'menu-1', imageRef }).imageUrl,
      ).toBeNull();
    },
  );
});
