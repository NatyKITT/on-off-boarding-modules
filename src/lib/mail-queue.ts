export async function processMailQueueBatch(
  opts?: { batchSize?: number }
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const batchSize = opts?.batchSize ?? 20

  void batchSize

  return {
    processed: 0,
    succeeded: 0,
    failed: 0,
  }
}
