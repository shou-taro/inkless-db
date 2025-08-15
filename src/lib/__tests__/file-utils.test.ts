import { describe, it, expect } from 'vitest';
import { getBaseName, isAcceptedFileName } from '@/lib/file-utils';

describe('getBaseName', () => {
  it('extracts basename from POSIX paths', () => {
    expect(getBaseName('/var/data/db/inkless.sqlite')).toBe('inkless.sqlite');
  });

  it('extracts basename from Windows paths', () => {
    expect(getBaseName('C:\\\\data\\db\\inkless.db')).toBe('inkless.db');
  });

  it('ignores trailing separator', () => {
    expect(getBaseName('/var/data/db/')).toBe('db');
    expect(getBaseName('C:\\\\data\\db\\\\')).toBe('db');
  });

  it('returns input if there are no separators', () => {
    expect(getBaseName('inkless.sqlite')).toBe('inkless.sqlite');
  });

  it('handles empty/whitespace strings gracefully', () => {
    expect(getBaseName('')).toBe('');
    expect(getBaseName('   ')).toBe('');
  });
});

describe('isAcceptedFileName', () => {
  it('accepts .sqlite and .db (case-insensitive)', () => {
    expect(isAcceptedFileName('a.sqlite')).toBe(true);
    expect(isAcceptedFileName('a.SQLITE')).toBe(true);
    expect(isAcceptedFileName('b.db')).toBe(true);
    expect(isAcceptedFileName('b.DB')).toBe(true);
  });

  it('rejects other extensions or missing extension', () => {
    expect(isAcceptedFileName('c.txt')).toBe(false);
    expect(isAcceptedFileName('noext')).toBe(false);
    expect(isAcceptedFileName('')).toBe(false);
  });
});
