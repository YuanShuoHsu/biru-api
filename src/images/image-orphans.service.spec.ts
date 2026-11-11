import type { ConfigService } from '@nestjs/config';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { ImageOrphansService } from './image-orphans.service.js';
import { ImageStorageService } from './image-storage.service.js';

const S3_ENV: Record<string, string> = {
  S3_ENDPOINT: 'https://project.storage.supabase.co/storage/v1/s3',
  S3_REGION: 'ap-northeast-1',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_BUCKET: 'biru-images',
  S3_PUBLIC_URL: 'https://images.example.com/storage/v1/object/public/biru',
};
const PUBLIC_URL = S3_ENV.S3_PUBLIC_URL;

const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
const RECENT = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

const storageWith = (env: Record<string, string | undefined>) =>
  new ImageStorageService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('ImageOrphansService', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let objects: Record<string, _Object[]>;
  let send: ReturnType<typeof vi.spyOn>;

  const pageSize = 2;
  const listCalls = () =>
    send.mock.calls
      .map(([command]) => command)
      .filter((command) => command instanceof ListObjectsV2Command);
  const deleteCalls = () =>
    send.mock.calls
      .map(([command]) => command)
      .filter(
        (command): command is DeleteObjectsCommand =>
          command instanceof DeleteObjectsCommand,
      );

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;

    await db.insert(schema.banner).values([
      { id: 'banner-1', image: `${PUBLIC_URL}/banner/referenced.png` },
      { id: 'banner-2', image: 'data:image/png;base64,iVBORw0KGgo=' },
    ]);
    await db.insert(schema.deletedRecord).values({
      batchId: 1,
      tableName: 'menu_item',
      recordId: 'item-1',
      data: { id: 'item-1', image: `${PUBLIC_URL}/menuItem/deleted.png` },
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    objects = {
      'banner/': [
        { Key: 'banner/referenced.png', LastModified: OLD },
        { Key: 'banner/orphan.png', LastModified: OLD },
        { Key: 'banner/recent.png', LastModified: RECENT },
      ],
      'menuItem/': [
        { Key: 'menuItem/deleted.png', LastModified: OLD },
        { Key: 'menuItem/orphan.png', LastModified: OLD },
      ],
    };
    send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation((command: unknown) => {
        if (command instanceof ListObjectsV2Command) {
          const { Prefix = '', ContinuationToken } = command.input;
          const start = Number(ContinuationToken ?? 0);
          const all = objects[Prefix] ?? [];
          const next = start + pageSize;
          return Promise.resolve({
            Contents: all.slice(start, next),
            NextContinuationToken: next < all.length ? String(next) : undefined,
          });
        }
        if (command instanceof DeleteObjectsCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('unexpected command'));
      }) as unknown as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createService = (env = S3_ENV) =>
    new ImageOrphansService(db, storageWith(env));

  it('dry-run 只回報不被參照且超過寬限期的物件，不呼叫刪除', async () => {
    const result = await createService().sweep(false);

    expect(result.applied).toBe(false);
    expect(result.kinds.find(({ kind }) => kind === 'banner')).toEqual({
      kind: 'banner',
      scanned: 3,
      count: 1,
      keys: ['banner/orphan.png'],
    });
    expect(result.kinds.find(({ kind }) => kind === 'menuItem')).toEqual({
      kind: 'menuItem',
      scanned: 2,
      count: 1,
      keys: ['menuItem/orphan.png'],
    });
    expect(deleteCalls()).toHaveLength(0);
  });

  it('只列出各圖片種類的 prefix，並依 continuation token 讀完每一頁', async () => {
    await createService().sweep(false);

    const prefixes = listCalls().map(({ input }) => input.Prefix);
    expect(new Set(prefixes)).toEqual(
      new Set([
        'menu/',
        'menuSection/',
        'menuItem/',
        'modifier/',
        'banner/',
        'storePhoto/',
      ]),
    );
    expect(
      listCalls()
        .filter(({ input }) => input.Prefix === 'banner/')
        .map(({ input }) => input.ContinuationToken),
    ).toEqual([undefined, '2']);
  });

  it('其他 prefix 的物件不會被刪', async () => {
    objects['avatar/'] = [{ Key: 'avatar/orphan.png', LastModified: OLD }];

    const result = await createService().sweep(true);

    const deleted = deleteCalls().flatMap(
      ({ input }) => input.Delete?.Objects?.map(({ Key }) => Key) ?? [],
    );
    expect(deleted).not.toContain('avatar/orphan.png');
    expect(result.kinds.flatMap(({ keys }) => keys)).not.toContain(
      'avatar/orphan.png',
    );
  });

  it('apply 時刪除孤兒物件並回報已刪除的 key', async () => {
    const result = await createService().sweep(true);

    expect(result.applied).toBe(true);
    expect(
      deleteCalls().map(({ input }) => ({
        bucket: input.Bucket,
        keys: input.Delete?.Objects?.map(({ Key }) => Key),
      })),
    ).toEqual([
      { bucket: 'biru-images', keys: ['menuItem/orphan.png'] },
      { bucket: 'biru-images', keys: ['banner/orphan.png'] },
    ]);
    expect(result.kinds.flatMap(({ keys }) => keys)).toEqual([
      'menuItem/orphan.png',
      'banner/orphan.png',
    ]);
  });

  it('apply 時每批最多刪除 1000 個', async () => {
    objects['storePhoto/'] = Array.from({ length: 2500 }, (_, i) => ({
      Key: `storePhoto/${i}.png`,
      LastModified: OLD,
    }));

    const result = await createService().sweep(true);

    expect(
      deleteCalls()
        .filter(({ input }) =>
          input.Delete?.Objects?.[0]?.Key?.startsWith('storePhoto/'),
        )
        .map(({ input }) => input.Delete?.Objects?.length),
    ).toEqual([1000, 1000, 500]);
    expect(result.kinds.find(({ kind }) => kind === 'storePhoto')?.count).toBe(
      2500,
    );
  });

  it('刪除失敗的 key 不算在已刪除的清單內', async () => {
    send.mockImplementation((command: unknown) => {
      if (command instanceof DeleteObjectsCommand) {
        return Promise.resolve({
          Errors: [{ Key: 'banner/orphan.png', Code: 'AccessDenied' }],
        });
      }
      const { Prefix = '' } = (command as ListObjectsV2Command).input;
      return Promise.resolve({ Contents: objects[Prefix] ?? [] });
    });

    const result = await createService().sweep(true);

    expect(result.kinds.find(({ kind }) => kind === 'banner')).toMatchObject({
      count: 0,
      keys: [],
    });
  });

  it('沒設定儲存空間時回傳空結果且不呼叫 S3', async () => {
    const result = await createService({
      ...S3_ENV,
      S3_BUCKET: undefined,
    } as unknown as Record<string, string>).sweep(true);

    expect(result).toEqual({ applied: true, kinds: [] });
    expect(send).not.toHaveBeenCalled();
  });
});
