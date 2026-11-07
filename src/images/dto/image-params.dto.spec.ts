import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ImageParamsDto } from './image-params.dto.js';

const errorsOf = async (version: string) =>
  (
    await validate(
      plainToInstance(ImageParamsDto, {
        kind: 'banner',
        id: 'banner-1',
        version,
        extension: 'png',
      }),
    )
  ).map(({ property }) => property);

describe('ImageParamsDto', () => {
  it.each(['0123456789abcdef', '1762315200123'])(
    '接受圖片雜湊與舊網址的毫秒數：%s',
    async (version) => {
      expect(await errorsOf(version)).toEqual([]);
    },
  );

  it.each(['0123456789ABCDEF', '0123456789abcdef0', 'latest', ''])(
    '拒絕其他版本字串：%j',
    async (version) => {
      expect(await errorsOf(version)).toEqual(['version']);
    },
  );
});
