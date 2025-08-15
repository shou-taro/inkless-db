import { describe, it, expect } from 'vitest';
import { formatBytes, type FormatBytesOptions } from '@/lib/format';

describe('formatBytes', () => {
  it('renders 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('uses base 1024 by default (IEC-like)', () => {
    expect(formatBytes(1536)).toBe('1.5 KB'); // 1536 = 1.5 * 1024
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('supports base 1000 (SI)', () => {
    const opts: FormatBytesOptions = { base: 1000 };
    expect(formatBytes(1500, opts)).toBe('1.5 kB');
  });

  it('respects explicit decimals', () => {
    expect(formatBytes(1048576, { decimals: 2 })).toBe('1.00 MB');
    expect(formatBytes(999, { decimals: 3 })).toBe('999.000 B');
  });

  it('smart decimals: <10 in non-byte units → 1 dp, else 0', () => {
    expect(formatBytes(1536)).toBe('1.5 KB'); // <10 → 1dp
    expect(formatBytes(10 * 1024)).toBe('10 KB'); // ≥10 → 0dp
  });

  it('can omit the space between value and unit', () => {
    expect(formatBytes(1536, { space: false })).toBe('1.5KB');
  });

  it('handles negatives', () => {
    expect(formatBytes(-2048)).toBe('-2 KB');
  });

  it('returns empty string for undefined/null', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore testing runtime behaviour for undefined
    expect(formatBytes(undefined)).toBe('');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore testing runtime behaviour for null
    expect(formatBytes(null)).toBe('');
  });

  it('supports custom units list (clamps at max unit)', () => {
    const units = ['B', 'KiB', 'MiB'] as const; // up to MiB
    expect(formatBytes(1024 ** 3, { units })).toBe('1024 MiB'); // beyond list → clamps
  });
});
