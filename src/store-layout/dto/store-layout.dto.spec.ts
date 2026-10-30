import { readFileSync } from 'node:fs';

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import { UpdateStoreLayoutDto } from './store-layout.dto.js';

const paths = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap(({ property, children }) =>
    children?.length
      ? paths(children, `${prefix}${property}.`)
      : [`${prefix}${property}`],
  );

const errorsOf = async (body: unknown) =>
  paths(
    await validate(plainToInstance(UpdateStoreLayoutDto, body), {
      forbidNonWhitelisted: true,
      whitelist: true,
    }),
  );

const box = {
  floor: 'upper',
  x: -3.5,
  z: 12,
  width: 0.6,
  depth: 0.6,
  height: 0.45,
  elevation: 0,
  label: 'chair2',
};

const item = { ...box, kind: 'seat', label: 'table', tableNumber: 201 };

const body = (overrides: { item?: object; seat?: object } = {}) => ({
  data: {
    items: [{ ...item, ...overrides.item }],
    seats: [{ ...box, ...overrides.seat }],
  },
});

describe('UpdateStoreLayoutDto', () => {
  it('accepts a valid layout', async () => {
    expect(await errorsOf(body())).toEqual([]);
  });

  it('accepts the layout seeded by the migration', async () => {
    const json = /'(\{"items".*\})'::jsonb/.exec(
      readFileSync('./drizzle/0245_store_layout.sql', 'utf8'),
    )?.[1];

    expect(await errorsOf({ data: JSON.parse(json ?? 'null') })).toEqual([]);
  });

  it.each([
    [{ item: { floor: 'basement' } }, 'data.items.0.floor'],
    [{ seat: { floor: 'roof2' } }, 'data.seats.0.floor'],
    [{ item: { width: -1 } }, 'data.items.0.width'],
    [{ seat: { depth: 0 } }, 'data.seats.0.depth'],
    [{ item: { height: 101 } }, 'data.items.0.height'],
    [{ item: { x: 100.5 } }, 'data.items.0.x'],
    [{ seat: { elevation: -0.1 } }, 'data.seats.0.elevation'],
    [{ item: { kind: 'sofa' } }, 'data.items.0.kind'],
    [{ item: { label: '1table' } }, 'data.items.0.label'],
    [{ seat: { label: 'chair-1' } }, 'data.seats.0.label'],
    [{ item: { tableNumber: 0 } }, 'data.items.0.tableNumber'],
    [{ item: { tableNumber: null } }, 'data.items.0.tableNumber'],
    [{ item: { tableNumber: 1.5 } }, 'data.items.0.tableNumber'],
    [{ item: { tableNumber: 1000 } }, 'data.items.0.tableNumber'],
    [{ item: { color: 'red' } }, 'data.items.0.color'],
    [{ seat: { kind: 'seat' } }, 'data.seats.0.kind'],
    [{ seat: { tableNumber: 1 } }, 'data.seats.0.tableNumber'],
  ])('rejects %j', async (overrides, path) => {
    expect(await errorsOf(body(overrides))).toEqual([path]);
  });

  it.each([
    [{}, ['data']],
    [{ data: { items: [] } }, ['data.seats']],
    [{ data: { items: [1], seats: [] } }, ['data.items.0']],
    [{ ...body(), extra: true }, ['extra']],
  ])('rejects %j', async (input, expected) => {
    expect(await errorsOf(input)).toEqual(expected);
  });

  it('rejects more items or seats than the limits', async () => {
    expect(
      await errorsOf({
        data: {
          items: Array.from({ length: 2001 }, () => item),
          seats: Array.from({ length: 5001 }, () => box),
        },
      }),
    ).toEqual(['data.items', 'data.seats']);
  });
});
