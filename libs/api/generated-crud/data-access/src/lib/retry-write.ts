/** Retry a complete, standalone Prisma write only when its transaction was rolled back. */
export async function retryWrite<T>(write: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await write()
    } catch (error) {
      if (
        attempt >= 5 ||
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'P2034'
      ) {
        throw error
      }
      // Back off with jitter so conflicting writers do not repeatedly retry together.
      await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 50))
    }
  }
}
