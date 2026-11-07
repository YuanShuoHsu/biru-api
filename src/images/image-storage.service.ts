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
  private readonly r2: {
    client: S3Client;
    bucket: string;
    publicUrl: string;
  } | null;

  constructor(configService: ConfigService) {
    const accountId = configService.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = configService.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = configService.get<string>('R2_BUCKET');
    const publicUrl = configService.get<string>('R2_PUBLIC_URL');

    // https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
    this.r2 =
      accountId && accessKeyId && secretAccessKey && bucket && publicUrl
        ? {
            client: new S3Client({
              region: 'auto',
              endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId, secretAccessKey },
            }),
            bucket,
            publicUrl: publicUrl.replace(/\/+$/, ''),
          }
        : null;
  }

  async store<T extends string | null | undefined>(
    kind: ImageKind,
    image: T,
  ): Promise<T | string> {
    const parsed = image ? parseImageDataUrl(image) : null;
    if (!this.r2 || !image || !parsed) return image;

    const key = `${kind}/${imageVersion(image)}.${parsed.extension}`;
    await this.r2.client.send(
      new PutObjectCommand({
        Bucket: this.r2.bucket,
        Key: key,
        Body: Buffer.from(parsed.base64, 'base64'),
        ContentType: parsed.mimeType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return `${this.r2.publicUrl}/${key}`;
  }
}
