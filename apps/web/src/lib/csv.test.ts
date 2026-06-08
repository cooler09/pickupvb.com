import { describe, it, expect } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('passes plain values through unchanged', () => {
    expect(csvCell('Beach Volleyball')).toBe('Beach Volleyball');
    expect(csvCell('pi_3Abc123')).toBe('pi_3Abc123');
    expect(csvCell('2026-06-08')).toBe('2026-06-08');
  });

  it('returns empty string for null / undefined', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes and escapes commas, quotes, and newlines (RFC-4180)', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  // Formula-injection defense — the security-relevant cases (receipts-tax R-3).
  it('prefixes a leading =, +, -, @, TAB, or CR with a single quote', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tnudge')).toBe("'\tnudge");
    expect(csvCell('\rnudge')).toBe("'\rnudge");
  });

  it('neutralizes a formula payload that also needs quoting', () => {
    // A malicious event title with a comma: must be both de-fanged AND quoted.
    expect(csvCell('=HYPERLINK("http://evil","x"),y')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x""),y"',
    );
  });

  it('does not prefix a value where the special char is not first', () => {
    expect(csvCell('A=B')).toBe('A=B');
    expect(csvCell('5 - 3 court')).toBe('5 - 3 court');
  });
});
