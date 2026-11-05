import { parseImageDataUrl, withImageUrl } from './image-url.js';

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

describe('withImageUrl', () => {
  const updatedAt = new Date('2026-11-05T04:00:00.123Z');

  it('以 updatedAt 的毫秒數當版本，並拿掉原本的 image', () => {
    expect(
      withImageUrl('menuItem', {
        id: 'item-1',
        image: 'data:image/webp;base64,UklGRg==',
        updatedAt,
        name: 'Latte',
      }),
    ).toEqual({
      id: 'item-1',
      imageUrl: `/api/images/menuItem/item-1/${updatedAt.getTime()}.webp`,
      updatedAt,
      name: 'Latte',
    });
  });

  it.each([null, 'banner'])('image 為 %j 時 imageUrl 為 null', (image) => {
    expect(
      withImageUrl('banner', { id: 'banner-1', image, updatedAt }).imageUrl,
    ).toBeNull();
  });
});
