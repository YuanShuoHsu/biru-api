import { createHash } from 'crypto';

import { inArray, sql, type AnyColumn } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';

export const IMAGE_KINDS = [
  'menu',
  'menuSection',
  'menuItem',
  'modifier',
  'banner',
  'storePhoto',
] as const;

export type ImageKind = (typeof IMAGE_KINDS)[number];

const IMAGE_EXTENSIONS = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
} as const;

type ImageMimeType = keyof typeof IMAGE_EXTENSIONS;

export const IMAGE_EXTENSION_VALUES = Object.values(IMAGE_EXTENSIONS);

const DATA_URL_PREFIX = '^data:(image/[a-z+]+);base64,';

export const isImageMimeType = (value: string): value is ImageMimeType =>
  Object.hasOwn(IMAGE_EXTENSIONS, value);

export const parseImageDataUrl = (dataUrl: string) => {
  const match = new RegExp(DATA_URL_PREFIX).exec(dataUrl);
  if (!match || !isImageMimeType(match[1])) return null;

  const mimeType = match[1];

  return {
    mimeType,
    extension: IMAGE_EXTENSIONS[mimeType],
    base64: dataUrl.slice(match[0].length),
  };
};

export const imageVersion = (image: string) =>
  createHash('sha256').update(image).digest('hex').slice(0, 16);

const imagePath = (
  kind: ImageKind,
  id: string,
  version: string,
  extension: string,
) => `/api/images/${kind}/${id}/${version}.${extension}`;

export const withImageUrl = <T extends { id: string; image: string | null }>(
  kind: ImageKind,
  { image, ...row }: T,
): Omit<T, 'image'> & { imageUrl: string | null } => {
  if (image?.startsWith('https://')) return { ...row, imageUrl: image };

  const parsed = image ? parseImageDataUrl(image) : null;

  return {
    ...row,
    imageUrl:
      image && parsed
        ? imagePath(kind, row.id, imageVersion(image), parsed.extension)
        : null,
  };
};

// https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-POSIX-REGEXP
// https://www.postgresql.org/docs/current/functions-binarystring.html
// https://www.postgresql.org/docs/current/functions-string.html
export const imageRefSql = (image: AnyColumn) =>
  sql<
    string | null
  >`CASE WHEN starts_with(${image}, 'https://') THEN ${image} ELSE substring(left(${image}, 64) from ${DATA_URL_PREFIX}) || ' ' || left(encode(sha256(convert_to(${image}, 'UTF8')), 'hex'), 16) END`;

export type WithImageRef<T extends { image: string | null }> = Omit<
  T,
  'image'
> & { imageRef: string | null };

// https://orm.drizzle.team/docs/rqb#include-custom-fields
export const imageRefQuery = {
  columns: { image: false },
  extras: ({ image }: { image: AnyColumn }) => ({
    imageRef: imageRefSql(image).as('image_ref'),
  }),
} as const;

// https://orm.drizzle.team/docs/select#partial-select
export const withoutImage = <TColumns extends { image: AnyColumn }>({
  image,
  ...columns
}: TColumns) => columns;

// 分頁列表要先取出這一頁再算：放進分頁查詢的 select，Postgres 會對所有符合條件的列（含 offset 跳過的）讀圖算雜湊
export const withImageRefs = async <T extends { id: string }>(
  db: DrizzleDB,
  table: PgTable & { id: AnyPgColumn; image: AnyPgColumn },
  rows: T[],
): Promise<(T & { imageRef: string | null })[]> => {
  if (rows.length === 0) return [];

  const refs = await db
    .select({ id: table.id, imageRef: imageRefSql(table.image) })
    .from(table)
    .where(
      inArray(
        table.id,
        rows.map(({ id }) => id),
      ),
    );
  const refById = new Map(
    refs.map(({ id, imageRef }) => [id as string, imageRef]),
  );

  return rows.map((row) => ({ ...row, imageRef: refById.get(row.id) ?? null }));
};

export const imageRefUrl = (
  imageRef: string | null,
  path: (version: string, extension: string) => string,
): string | null => {
  if (imageRef?.startsWith('https://')) return imageRef;

  const [mimeType, version] = imageRef?.split(' ') ?? [];

  return mimeType && version && isImageMimeType(mimeType)
    ? path(version, IMAGE_EXTENSIONS[mimeType])
    : null;
};

export const withImageRefUrl = <
  T extends { id: string; imageRef: string | null },
>(
  kind: ImageKind,
  { imageRef, ...row }: T,
): Omit<T, 'imageRef'> & { imageUrl: string | null } => ({
  ...row,
  imageUrl: imageRefUrl(imageRef, (version, extension) =>
    imagePath(kind, row.id, version, extension),
  ),
});
