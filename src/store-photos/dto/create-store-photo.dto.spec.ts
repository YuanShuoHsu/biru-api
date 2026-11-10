import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateStorePhotoDto,
  UpdateStorePhotoDto,
} from './create-store-photo.dto.js';

import { languagesEnum } from '../../db/schema/enums.js';

const errorsOf = async (
  cls: new () => object,
  fields: Record<string, unknown>,
) =>
  (await validate(plainToInstance(cls, fields))).map(
    ({ property }) => property,
  );

const image = 'data:image/png;base64,iVBORw0KGgo=';

const fullAlt = Object.fromEntries(
  languagesEnum.enumValues.map((language) => [language, '門市外觀']),
);

describe('CreateStorePhotoDto', () => {
  it('accepts an alt filled in every language', async () => {
    expect(
      await errorsOf(CreateStorePhotoDto, { image, alt: fullAlt }),
    ).toEqual([]);
  });

  it.each([
    {},
    { en: '  ' },
    { en: '', 'zh-TW': ' ' },
    { 'zh-TW': '門市外觀', en: '' },
  ])('rejects alt %j', async (alt) => {
    expect(await errorsOf(CreateStorePhotoDto, { image, alt })).toEqual([
      'alt',
    ]);
  });

  it('accepts an alt of 160 characters and rejects 161 in any language', async () => {
    expect(
      await errorsOf(CreateStorePhotoDto, {
        image,
        alt: { ...fullAlt, en: 'a'.repeat(160) },
      }),
    ).toEqual([]);
    expect(
      await errorsOf(CreateStorePhotoDto, {
        image,
        alt: { ...fullAlt, ja: 'あ'.repeat(161) },
      }),
    ).toEqual(['alt']);
    expect(
      await errorsOf(CreateStorePhotoDto, {
        image,
        alt: { ...fullAlt, en: '𠮷'.repeat(160) },
      }),
    ).toEqual([]);
  });

  it('accepts a sortOrder up to 9999 and rejects 10000', async () => {
    const photoOf = (sortOrder: number) =>
      errorsOf(CreateStorePhotoDto, { image, alt: fullAlt, sortOrder });

    expect(await photoOf(9999)).toEqual([]);
    expect(await photoOf(10000)).toEqual(['sortOrder']);
  });

  it('rejects an svg image', async () => {
    expect(
      await errorsOf(CreateStorePhotoDto, {
        image: 'data:image/svg+xml;base64,PHN2Zz4=',
        alt: fullAlt,
      }),
    ).toEqual(['image']);
  });
});

describe('UpdateStorePhotoDto', () => {
  it('accepts a partial update', async () => {
    expect(await errorsOf(UpdateStorePhotoDto, { isActive: false })).toEqual(
      [],
    );
  });

  it.each(['image', 'alt', 'isActive', 'sortOrder'])(
    'rejects %s set to null',
    async (property) => {
      expect(await errorsOf(UpdateStorePhotoDto, { [property]: null })).toEqual(
        [property],
      );
    },
  );

  it('rejects a sortOrder over 9999', async () => {
    expect(await errorsOf(UpdateStorePhotoDto, { sortOrder: 10000 })).toEqual([
      'sortOrder',
    ]);
  });

  it('rejects a blank alt', async () => {
    expect(await errorsOf(UpdateStorePhotoDto, { alt: { en: ' ' } })).toEqual([
      'alt',
    ]);
  });
});
