import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import {
  imageVersion,
  parseImageDataUrl,
  type ImageKind,
} from './image-url.js';

@Injectable()
export class ImageStorageService {
  private readonly storage: {
    client: S3Client;
    bucket: string;
    publicUrl: string;
  } | null;

  constructor(configService: ConfigService) {
    const endpoint = configService.get<string>('S3_ENDPOINT');
    const region = configService.get<string>('S3_REGION');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');
    const bucket = configService.get<string>('S3_BUCKET');
    const publicUrl = configService.get<string>('S3_PUBLIC_URL');

    // https://supabase.com/docs/guides/storage/s3/authentication
    this.storage =
      endpoint &&
      region &&
      accessKeyId &&
      secretAccessKey &&
      bucket &&
      publicUrl
        ? {
            client: new S3Client({
              forcePathStyle: true,
              region,
              endpoint,
              credentials: { accessKeyId, secretAccessKey },
            }),
            bucket,
            publicUrl: publicUrl.replace(/\/+$/, ''),
          }
        : null;
  }

  uploads(image: string) {
    return this.storage !== null && parseImageDataUrl(image) !== null;
  }

  async store<T extends string | null | undefined>(
    kind: ImageKind | 'user' | 'organization',
    image: T,
  ): Promise<T | string> {
    const parsed = image ? parseImageDataUrl(image) : null;
    if (!this.storage || !image || !parsed) return image;

    const key = `${kind}/${imageVersion(image)}.${parsed.extension}`;
    await this.storage.client.send(
      new PutObjectCommand({
        Bucket: this.storage.bucket,
        Key: key,
        Body: Buffer.from(parsed.base64, 'base64'),
        ContentType: parsed.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return `${this.storage.publicUrl}/${key}`;
  }
}
