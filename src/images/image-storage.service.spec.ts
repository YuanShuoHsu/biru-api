import type { ConfigService } from '@nestjs/config';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { ImageStorageService } from './image-storage.service.js';
import { imageVersion } from './image-url.js';

const R2_ENV = {
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'biru-images',
  R2_PUBLIC_URL: 'https://images.example.com',
};

const createService = (env: Record<string, string | undefined>) =>
  new ImageStorageService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('ImageStorageService', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  let send: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('設定齊全時上傳到 R2 並回傳公開網址', async () => {
    const url = await createService(R2_ENV).store('menuItem', image);

    expect(url).toBe(
      `https://images.example.com/menuItem/${imageVersion(image)}.png`,
    );
    expect(send).toHaveBeenCalledOnce();
    const [command] = send.mock.calls[0] as [PutObjectCommand];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'biru-images',
      Key: `menuItem/${imageVersion(image)}.png`,
      Body: Buffer.from('iVBORw0KGgo=', 'base64'),
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('公開網址結尾的斜線不會重複', async () => {
    const url = await createService({
      ...R2_ENV,
      R2_PUBLIC_URL: 'https://images.example.com/',
    }).store('banner', image);

    expect(url).toBe(
      `https://images.example.com/banner/${imageVersion(image)}.png`,
    );
  });

  it('相同內容得到相同網址', async () => {
    const service = createService(R2_ENV);

    expect(await service.store('banner', image)).toBe(
      await service.store('banner', image),
    );
  });

  it.each(Object.keys(R2_ENV))('缺少 %s 時原樣回傳且不上傳', async (key) => {
    expect(
      await createService({ ...R2_ENV, [key]: undefined }).store(
        'banner',
        image,
      ),
    ).toBe(image);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    '',
    'https://images.example.com/banner/0123456789abcdef.png',
    'data:image/bmp;base64,Qk0=',
  ])('%j 不是圖片 data URL，原樣回傳且不上傳', async (value) => {
    expect(await createService(R2_ENV).store('banner', value)).toBe(value);
    expect(send).not.toHaveBeenCalled();
  });
});
