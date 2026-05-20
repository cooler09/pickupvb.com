import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REFUND_WINDOW_HOURS,
  MAX_REFUND_WINDOW_HOURS,
  parsePriceCents,
  parseRefundWindowHours,
} from './money';

describe('parsePriceCents', () => {
  it('parses dollars to cents', () => {
    expect(parsePriceCents('19.99')).toBe(1999);
  });

  it('rounds to the nearest cent', () => {
    expect(parsePriceCents('19.999')).toBe(2000);
    expect(parsePriceCents('19.994')).toBe(1999);
  });

  it('returns 0 for empty / undefined', () => {
    expect(parsePriceCents('')).toBe(0);
    expect(parsePriceCents(undefined)).toBe(0);
  });

  it('returns 0 for non-numeric input', () => {
    expect(parsePriceCents('free')).toBe(0);
  });

  it('clamps negatives to 0', () => {
    expect(parsePriceCents('-5')).toBe(0);
  });

  it('handles whole-dollar input', () => {
    expect(parsePriceCents('20')).toBe(2000);
  });
});

describe('parseRefundWindowHours', () => {
  it('falls back to the default when empty', () => {
    expect(parseRefundWindowHours('')).toBe(DEFAULT_REFUND_WINDOW_HOURS);
    expect(parseRefundWindowHours(undefined)).toBe(DEFAULT_REFUND_WINDOW_HOURS);
  });

  it('falls back to the default for non-numeric input', () => {
    expect(parseRefundWindowHours('soon')).toBe(DEFAULT_REFUND_WINDOW_HOURS);
  });

  it('clamps above the maximum', () => {
    expect(parseRefundWindowHours('10000')).toBe(MAX_REFUND_WINDOW_HOURS);
  });

  it('clamps below zero', () => {
    expect(parseRefundWindowHours('-3')).toBe(0);
  });

  it('rounds fractional input', () => {
    expect(parseRefundWindowHours('4.6')).toBe(5);
  });

  it('passes through a valid value', () => {
    expect(parseRefundWindowHours('48')).toBe(48);
  });
});
