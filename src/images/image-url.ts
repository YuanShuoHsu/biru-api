import { createHash } from 'crypto';

import { sql, type AnyColumn } from 'drizzle-orm';

export const IMAGE_KINDS = [
  'menu',
  'menuSection',
  'menuItem',
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

const isImageMimeType = (value: string): value is ImageMimeType =>
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
  mimeType: ImageMimeType,
) => `/api/images/${kind}/${id}/${version}.${IMAGE_EXTENSIONS[mimeType]}`;

export const withImageUrl = <T extends { id: string; image: string | null }>(
  kind: ImageKind,
  { image, ...row }: T,
): Omit<T, 'image'> & { imageUrl: string | null } => {
  const parsed = image ? parseImageDataUrl(image) : null;

  return {
    ...row,
    imageUrl:
      image && parsed
        ? imagePath(kind, row.id, imageVersion(image), parsed.mimeType)
        : null,
  };
};

// https://www.postgresql.org/docs/current/functions-matching.html#FUNCTIONS-POSIX-REGEXP
// https://www.postgresql.org/docs/current/functions-binarystring.html
export const imageRefSql = (image: AnyColumn) =>
  sql<
    string | null
  >`substring(left(${image}, 64) from ${DATA_URL_PREFIX}) || ' ' || left(encode(sha256(convert_to(${image}, 'UTF8')), 'hex'), 16)`;

export const withImageRefUrl = <
  T extends { id: string; imageRef: string | null },
>(
  kind: ImageKind,
  { imageRef, ...row }: T,
): Omit<T, 'imageRef'> & { imageUrl: string | null } => {
  const [mimeType, version] = imageRef?.split(' ') ?? [];

  return {
    ...row,
    imageUrl:
      mimeType && version && isImageMimeType(mimeType)
        ? imagePath(kind, row.id, version, mimeType)
        : null,
  };
};
