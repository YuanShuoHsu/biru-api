import type { ConfigService } from '@nestjs/config';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
  type _Error,
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

const PAGE_SIZE = 2;
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
  let beforeList: (prefix: string) => Promise<void>;
  let deleteErrors: (keys: string[]) => _Error[];

  const commands = () =>
    (send.mock.calls as [unknown][]).map(([command]) => command);
  const listCalls = () =>
    commands().filter(
      (command): command is ListObjectsV2Command =>
        command instanceof ListObjectsV2Command,
    );
  const deleteCalls = () =>
    commands().filter(
      (command): command is DeleteObjectsCommand =>
        command instanceof DeleteObjectsCommand,
    );
  const deletedKeys = () =>
    deleteCalls().flatMap(
      ({ input }) => input.Delete?.Objects?.map(({ Key }) => Key) ?? [],
    );

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;

    await db.insert(schema.banner).values([
      { id: 'banner-1', image: `${PUBLIC_URL}/banner/referenced.png` },
      { id: 'banner-2', image: 'data:image/png;base64,iVBORw0KGgo=' },
      {
        id: 'banner-3',
        image: 'https://cdn.example.com/banner/other-host.png',
      },
    ]);
    await db.insert(schema.deletedRecord).values([
      {
        batchId: 1,
        tableName: 'menu_item',
        recordId: 'item-1',
        data: { id: 'item-1', image: `${PUBLIC_URL}/menuItem/deleted.png` },
      },
      {
        batchId: 2,
        tableName: 'order',
        recordId: 'order-1',
        data: {
          id: 'order-1',
          image: `${PUBLIC_URL}/menuItem/not-image-table.png`,
        },
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    objects = {
      'banner/': [
        { Key: 'banner/referenced.png', LastModified: OLD },
        { Key: 'banner/other-host.png', LastModified: OLD },
        { Key: 'banner/orphan.png', LastModified: OLD },
        { Key: 'banner/recent.png', LastModified: RECENT },
      ],
      'menuItem/': [
        { Key: 'menuItem/deleted.png', LastModified: OLD },
        { Key: 'menuItem/not-image-table.png', LastModified: OLD },
        { Key: 'menuItem/orphan.png', LastModified: OLD },
      ],
    };
    beforeList = () => Promise.resolve();
    deleteErrors = () => [];
    send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(async (command: unknown) => {
        if (command instanceof ListObjectsV2Command) {
          const { Prefix = '', ContinuationToken } = command.input;
          await beforeList(Prefix);
          const start = Number(ContinuationToken ?? 0);
          const all = objects[Prefix] ?? [];
          const next = start + PAGE_SIZE;
          return {
            Contents: all.slice(start, next),
            NextContinuationToken: next < all.length ? String(next) : undefined,
          };
        }
        if (command instanceof DeleteObjectsCommand) {
          const keys =
            command.input.Delete?.Objects?.flatMap(({ Key }) =>
              Key ? [Key] : [],
            ) ?? [];
          return { Errors: deleteErrors(keys) };
        }
        throw new Error('unexpected command');
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createService = (env: Record<string, string | undefined> = S3_ENV) =>
    new ImageOrphansService(db, storageWith(env));

  const kindOf = (
    result: Awaited<ReturnType<ImageOrphansService['sweep']>>,
    kind: string,
  ) => result.kinds.find((entry) => entry.kind === kind);

  it('dry-run 只回報不被參照且超過寬限期的物件，不呼叫刪除', async () => {
    const result = await createService().sweep(false);

    expect(result.applied).toBe(false);
    expect(kindOf(result, 'banner')).toEqual({
      kind: 'banner',
      scanned: 4,
      count: 1,
      keys: ['banner/orphan.png'],
    });
    expect(kindOf(result, 'menuItem')).toEqual({
      kind: 'menuItem',
      scanned: 3,
      count: 2,
      keys: ['menuItem/not-image-table.png', 'menuItem/orphan.png'],
    });
    expect(deleteCalls()).toHaveLength(0);
  });

  it('其他網域的圖片網址仍以路徑末段的 key 視為參照', async () => {
    const result = await createService().sweep(false);

    expect(kindOf(result, 'banner')?.keys).not.toContain(
      'banner/other-host.png',
    );
  });

  it('不在圖片資料表的 deleted_record 不算參照', async () => {
    const result = await createService().sweep(false);

    expect(kindOf(result, 'menuItem')?.keys).toContain(
      'menuItem/not-image-table.png',
    );
  });

  it('7 天內才被換下的舊圖不刪，超過 7 天或不屬於圖片種類的異動不算參照', async () => {
    const audit = (
      id: string,
      resource: 'modifier' | 'coupon',
      before: string,
      createdAt: Date,
    ) => ({
      id,
      actorName: 'Admin',
      actorEmail: 'admin@example.com',
      resource,
      resourceId: `${resource}-1`,
      action: 'update' as const,
      changes: {
        image: { before: `${PUBLIC_URL}/${before}`, after: null },
      },
      createdAt,
    });
    await db
      .insert(schema.auditLog)
      .values([
        audit('audit-1', 'modifier', 'modifier/replaced-recently.png', RECENT),
        audit('audit-2', 'modifier', 'modifier/replaced-long-ago.png', OLD),
        audit('audit-3', 'coupon', 'modifier/other-resource.png', RECENT),
      ]);
    objects['modifier/'] = [
      { Key: 'modifier/replaced-recently.png', LastModified: OLD },
      { Key: 'modifier/replaced-long-ago.png', LastModified: OLD },
      { Key: 'modifier/other-resource.png', LastModified: OLD },
    ];

    const result = await createService().sweep(false);

    expect(kindOf(result, 'modifier')?.keys).toEqual([
      'modifier/replaced-long-ago.png',
      'modifier/other-resource.png',
    ]);
  });

  it('只列出各圖片種類的 prefix，並依 continuation token 讀完每一頁', async () => {
    await createService().sweep(false);

    expect(listCalls().map(({ input }) => input.Prefix)).toEqual([
      'menu/',
      'menuSection/',
      'menuItem/',
      'menuItem/',
      'modifier/',
      'banner/',
      'banner/',
      'storePhoto/',
    ]);
    expect(
      listCalls()
        .filter(({ input }) => input.Prefix === 'banner/')
        .map(({ input }) => input.ContinuationToken),
    ).toEqual([undefined, '2']);
  });

  it('其他 prefix 的物件不會被刪', async () => {
    objects['avatar/'] = [{ Key: 'avatar/orphan.png', LastModified: OLD }];

    const result = await createService().sweep(true);

    expect(deletedKeys()).not.toContain('avatar/orphan.png');
    expect(result.kinds.flatMap(({ keys }) => keys)).not.toContain(
      'avatar/orphan.png',
    );
  });

  it('列出物件之後才寫入的參照不會被刪', async () => {
    objects['banner/'].push({
      Key: 'banner/reuploaded.png',
      LastModified: OLD,
    });
    beforeList = async (prefix) => {
      if (prefix !== 'storePhoto/') return;
      await db
        .insert(schema.banner)
        .values({
          id: 'banner-4',
          image: `${PUBLIC_URL}/banner/reuploaded.png`,
        })
        .onConflictDoNothing();
    };

    const result = await createService().sweep(true);

    expect(deletedKeys()).not.toContain('banner/reuploaded.png');
    expect(kindOf(result, 'banner')?.keys).toEqual(['banner/orphan.png']);
  });

  it('apply 時刪除孤兒物件並回報已刪除的 key', async () => {
    const result = await createService().sweep(true);

    expect(result.applied).toBe(true);
    expect(deleteCalls().map(({ input }) => input.Bucket)).toEqual([
      'biru-images',
    ]);
    expect(deletedKeys()).toEqual([
      'menuItem/not-image-table.png',
      'menuItem/orphan.png',
      'banner/orphan.png',
    ]);
    expect(result.kinds.flatMap(({ keys }) => keys)).toEqual(deletedKeys());
  });

  it('apply 時每批最多刪除 1000 個', async () => {
    objects['storePhoto/'] = Array.from({ length: 2500 }, (_, i) => ({
      Key: `storePhoto/${i}.png`,
      LastModified: OLD,
    }));

    const result = await createService().sweep(true);

    expect(
      deleteCalls().map(({ input }) => input.Delete?.Objects?.length),
    ).toEqual([1000, 1000, 503]);
    expect(kindOf(result, 'storePhoto')?.count).toBe(2500);
  });

  it('刪除失敗的 key 不算在已刪除的清單內', async () => {
    objects['storePhoto/'] = Array.from({ length: 1500 }, (_, i) => ({
      Key: `storePhoto/${i}.png`,
      LastModified: OLD,
    }));
    deleteErrors = (keys) =>
      keys.includes('storePhoto/1200.png')
        ? [{ Key: 'storePhoto/1200.png', Code: 'AccessDenied' }]
        : [];

    const result = await createService().sweep(true);

    expect(deleteCalls()).toHaveLength(2);
    const storePhoto = kindOf(result, 'storePhoto');
    expect(storePhoto?.count).toBe(1499);
    expect(storePhoto?.keys).not.toContain('storePhoto/1200.png');
    expect(kindOf(result, 'banner')?.keys).toEqual(['banner/orphan.png']);
  });

  it('沒設定儲存空間時回傳空結果且不呼叫 S3', async () => {
    const result = await createService({
      ...S3_ENV,
      S3_BUCKET: undefined,
    }).sweep(true);

    expect(result).toEqual({ applied: true, kinds: [] });
    expect(send).not.toHaveBeenCalled();
  });
});
