import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type _Error,
  type _Object,
} from '@aws-sdk/client-s3';

import {
  imageVersion,
  parseImageDataUrl,
  type ImageKind,
} from './image-url.js';

// https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
const DELETE_BATCH_SIZE = 1000;

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

  async list(prefix: string): Promise<_Object[] | null> {
    if (!this.storage) return null;

    const objects: _Object[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.storage.client.send(
        new ListObjectsV2Command({
          Bucket: this.storage.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      objects.push(...(page.Contents ?? []));
      continuationToken = page.NextContinuationToken;
    } while (continuationToken);

    return objects;
  }

  async delete(keys: string[]): Promise<_Error[]> {
    if (!this.storage) return [];

    const errors: _Error[] = [];
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const { Errors = [] } = await this.storage.client.send(
        new DeleteObjectsCommand({
          Bucket: this.storage.bucket,
          Delete: {
            Objects: keys
              .slice(i, i + DELETE_BATCH_SIZE)
              .map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      errors.push(...Errors);
    }

    return errors;
  }
}
