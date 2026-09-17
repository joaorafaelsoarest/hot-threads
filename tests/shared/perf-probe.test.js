import { describe, expect, it, vi } from 'vitest';
import { createPerfProbe } from '../../src/shared/perf-probe.js';

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

describe('performance probe', () => {
  it('aggregates counters and sync/async timing without collecting payloads', async () => {
    const entries = [];
    const probe = createPerfProbe({
      enabled: true,
      clock: sequence([10, 12, 20, 25]),
      sink: (entry) => entries.push(entry)
    });

    probe.count('mutation.records', 3);
    expect(probe.measure('header.reconcile', () => 'ok')).toBe('ok');
    await expect(probe.measureAsync('runtime.GET_DASHBOARD', async () => 'ok')).resolves.toBe('ok');
    probe.flush({ surface: 'content' });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      surface: 'content',
      counters: { 'mutation.records': 3 },
      timings: {
        'header.reconcile': { count: 1, totalMs: 2, maxMs: 2, p95Ms: 2 },
        'runtime.GET_DASHBOARD': { count: 1, totalMs: 5, maxMs: 5, p95Ms: 5 }
      }
    });
  });

  it('does not emit or alter the wrapped operation when disabled', async () => {
    const sink = vi.fn();
    const probe = createPerfProbe({ enabled: false, sink });
    const error = new Error('original');

    expect(probe.measure('sync', () => 42)).toBe(42);
    await expect(probe.measureAsync('async', async () => 43)).resolves.toBe(43);
    expect(() => probe.measure('error', () => { throw error; })).toThrow(error);
    await expect(probe.measureAsync('async-error', async () => { throw error; })).rejects.toBe(error);
    probe.flush({ surface: 'background' });

    expect(sink).not.toHaveBeenCalled();
  });

  it('calculates p95 from multiple samples', () => {
    const probe = createPerfProbe({ enabled: true, clock: sequence([0, 1, 2, 4, 5, 9, 10, 20]) });

    probe.measure('work', () => {});
    probe.measure('work', () => {});
    probe.measure('work', () => {});
    probe.measure('work', () => {});

    expect(probe.snapshot().timings.work).toEqual({
      count: 4,
      totalMs: 17,
      maxMs: 10,
      p95Ms: 10
    });
  });
});
