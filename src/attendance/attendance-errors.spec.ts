import { conflictError, runBatch } from './attendance-errors.js';

describe('runBatch', () => {
  it('runs each id once, in first-seen order', async () => {
    const run = vi.fn((_id: string) => Promise.resolve());

    const result = await runBatch(['a', 'b', 'a', 'c', 'b'], run);

    expect(run.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ succeeded: ['a', 'b', 'c'], skipped: [] });
  });

  it('skips ids that fail with an attendance error and keeps going', async () => {
    const run = vi.fn((id: string) =>
      id === 'b'
        ? Promise.reject(conflictError('activeShiftExists'))
        : Promise.resolve(),
    );

    const result = await runBatch(['a', 'b', 'c'], run);

    expect(result).toEqual({
      succeeded: ['a', 'c'],
      skipped: [
        {
          id: 'b',
          message: 'activeShiftExists',
          reason: 'activeShiftExists',
        },
      ],
    });
  });

  it('rethrows errors that are not attendance errors', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(runBatch(['a'], run)).rejects.toThrow('boom');
  });
});
