// Pure helpers: no imports, so `node --test` can load this file directly.

export const PAGE_SIZE = 20;

/** Ids on a page, newest first, for counters that run from 0 to total - 1. */
export function pageIds(total: number, page: number, size = PAGE_SIZE): number[] {
  const start = total - 1 - page * size;
  const ids: number[] = [];
  for (let id = start; id >= 0 && id > start - size; id--) ids.push(id);
  return ids;
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Runs `fn` over `items` with at most `limit` calls in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
