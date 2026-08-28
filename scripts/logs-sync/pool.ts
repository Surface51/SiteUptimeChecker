/** Runs `worker` over `items` with at most `concurrency` in flight. Never rejects — every
 * settlement (value or error) comes back in input order, so the caller reports failures itself
 * instead of one bad host aborting the run. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i]!, i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }

  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, run)
  await Promise.all(lanes)
  return results
}
