// Pionex 歷史端點沒有 offset 也沒有總筆數，只能用 endTime 往回翻
const MAX_ROUNDS = 5;

export interface HistoryPage<T> {
  data: T[];
  nextEndTime: number | null;
}

interface CollectHistoryPageOptions<T> {
  batchSize: number;
  endTime?: number;
  fetchBatch: (endTime?: number) => Promise<T[]>;
  idOf: (row: T) => string;
  keep?: (rows: T[]) => T[] | Promise<T[]>;
  limit: number;
  timeOf: (row: T) => number;
}

export const collectHistoryPage = async <T>({
  batchSize,
  endTime,
  fetchBatch,
  idOf,
  keep = (rows) => rows,
  limit,
  timeOf,
}: CollectHistoryPageOptions<T>): Promise<HistoryPage<T>> => {
  const seen = new Set<string>();
  const data: T[] = [];
  let cursor = endTime;
  let resumeAt: number | null = null;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const batch = await fetchBatch(cursor);
    const fresh = batch.filter((row) => !seen.has(idOf(row)));
    fresh.forEach((row) => seen.add(idOf(row)));

    const kept = (await keep(fresh)).sort((a, b) => timeOf(b) - timeOf(a));
    for (const row of kept) {
      const last = data.at(-1);
      // 同一毫秒的紀錄（例如一張市價單吃到多筆掛單）不能被頁界切開，否則 endTime 減一會漏掉
      if (last && data.length >= limit && timeOf(row) !== timeOf(last))
        return { data, nextEndTime: timeOf(last) - 1 };

      data.push(row);
    }

    if (batch.length < batchSize) return { data, nextEndTime: null };

    const oldest = Math.min(...batch.map(timeOf));
    cursor = fresh.length ? oldest : oldest - 1;
    resumeAt = oldest - 1;
  }

  return { data, nextEndTime: resumeAt };
};
