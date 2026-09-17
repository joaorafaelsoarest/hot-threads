function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return Number(sorted[index].toFixed(3));
}

function timingSummary(samples) {
  const totalMs = samples.reduce((total, value) => total + value, 0);
  return {
    count: samples.length,
    totalMs: Number(totalMs.toFixed(3)),
    maxMs: Number(Math.max(...samples).toFixed(3)),
    p95Ms: percentile(samples, 0.95)
  };
}

export function createPerfProbe({
  enabled = false,
  clock = defaultClock,
  sink = (entry) => console.info('[hot-threads:perf]', entry)
} = {}) {
  const counters = new Map();
  const samplesByName = new Map();

  function count(name, delta = 1) {
    if (!enabled) return 0;
    const next = (counters.get(name) || 0) + delta;
    counters.set(name, next);
    return next;
  }

  function record(name, duration) {
    if (!enabled) return;
    const samples = samplesByName.get(name) || [];
    samples.push(Math.max(0, duration));
    samplesByName.set(name, samples);
  }

  function measure(name, callback) {
    if (!enabled) return callback();
    const startedAt = clock();
    try {
      const result = callback();
      record(name, clock() - startedAt);
      return result;
    } catch (error) {
      record(name, clock() - startedAt);
      throw error;
    }
  }

  function measureAsync(name, callback) {
    if (!enabled) return callback();
    const startedAt = clock();
    let result;
    try {
      result = callback();
    } catch (error) {
      record(name, clock() - startedAt);
      throw error;
    }
    return Promise.resolve(result).then(
      (value) => {
        record(name, clock() - startedAt);
        return value;
      },
      (error) => {
        record(name, clock() - startedAt);
        throw error;
      }
    );
  }

  function snapshot(extra = {}) {
    return {
      ...extra,
      counters: Object.fromEntries(counters),
      timings: Object.fromEntries([...samplesByName].map(([name, samples]) => [name, timingSummary(samples)]))
    };
  }

  function flush(extra = {}) {
    if (!enabled) return null;
    const entry = snapshot(extra);
    sink(entry);
    counters.clear();
    samplesByName.clear();
    return entry;
  }

  return { count, measure, measureAsync, snapshot, flush };
}
