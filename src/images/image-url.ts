import { createHash } from 'crypto';

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

export const parseImageDataUrl = (dataUrl: string) => {
  const match = /^data:(image\/[a-z+]+);base64,/.exec(dataUrl);
  if (!match || !Object.hasOwn(IMAGE_EXTENSIONS, match[1])) return null;

  const mimeType = match[1] as ImageMimeType;

  return {
    mimeType,
    extension: IMAGE_EXTENSIONS[mimeType],
    base64: dataUrl.slice(match[0].length),
  };
};

export const imageVersion = (image: string) =>
  createHash('sha256').update(image).digest('hex').slice(0, 16);

export const withImageUrl = <T extends { id: string; image: string | null }>(
  kind: ImageKind,
  { image, ...row }: T,
): Omit<T, 'image'> & { imageUrl: string | null } => {
  const parsed = image ? parseImageDataUrl(image) : null;

  return {
    ...row,
    imageUrl:
      image && parsed
        ? `/api/images/${kind}/${row.id}/${imageVersion(image)}.${parsed.extension}`
        : null,
  };
};
