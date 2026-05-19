export type ProtocolMetricKind =
  | "client_encode"
  | "server_encode"
  | "client_decode"
  | "server_decode";

type ProtocolMetricBucket = {
  count: number;
  bytes: number[];
  durationMs: number[];
  failures: Record<string, number>;
};

export type ProtocolMetricsSnapshot = Record<
  ProtocolMetricKind,
  {
    count: number;
    bytesP95: number;
    bytesAverage: number;
    durationP95Ms: number;
    durationAverageMs: number;
    failures: Record<string, number>;
  }
>;

const buckets: Record<ProtocolMetricKind, ProtocolMetricBucket> = {
  client_encode: makeBucket(),
  server_encode: makeBucket(),
  client_decode: makeBucket(),
  server_decode: makeBucket(),
};

export function recordProtocolMetric(
  kind: ProtocolMetricKind,
  bytes: number,
  durationMs: number,
): void {
  const bucket = buckets[kind];
  bucket.count += 1;
  bucket.bytes.push(bytes);
  bucket.durationMs.push(durationMs);
}

export function recordProtocolDecodeFailure(
  kind: Extract<ProtocolMetricKind, "client_decode" | "server_decode">,
  reason: string,
): void {
  const bucket = buckets[kind];
  bucket.failures[reason] = (bucket.failures[reason] ?? 0) + 1;
}

export function getProtocolMetricsSnapshot(): ProtocolMetricsSnapshot {
  return {
    client_encode: summarizeBucket(buckets.client_encode),
    server_encode: summarizeBucket(buckets.server_encode),
    client_decode: summarizeBucket(buckets.client_decode),
    server_decode: summarizeBucket(buckets.server_decode),
  };
}

export function resetProtocolMetrics(): void {
  for (const kind of Object.keys(buckets) as ProtocolMetricKind[]) {
    buckets[kind] = makeBucket();
  }
}

function makeBucket(): ProtocolMetricBucket {
  return { count: 0, bytes: [], durationMs: [], failures: {} };
}

function summarizeBucket(bucket: ProtocolMetricBucket) {
  return {
    count: bucket.count,
    bytesP95: percentile(bucket.bytes, 0.95),
    bytesAverage: average(bucket.bytes),
    durationP95Ms: percentile(bucket.durationMs, 0.95),
    durationAverageMs: average(bucket.durationMs),
    failures: { ...bucket.failures },
  };
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
  );
}
