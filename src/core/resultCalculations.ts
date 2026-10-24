export interface GradingBand {
  grade: string;
  minScore: number;
  remark: string;
}

/** Port of Android ResultCalculations.kt. */
export function gradeFor(score: number | null | undefined, scale: GradingBand[]): GradingBand | null {
  if (score == null || !Number.isFinite(score) || score < 0 || score > 100) return null;
  return [...scale].sort((a, b) => b.minScore - a.minScore).find((band) => score >= band.minScore) ?? null;
}

export function average(values: Iterable<number | null | undefined>): number | null {
  const valid = [...values].filter((value): value is number => value != null && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

export function ordinal(position: number | bigint): string {
  const n = typeof position === 'bigint' ? position : BigInt(Number.isFinite(position) ? Math.trunc(position) : 0);
  if (n <= 0n) return '—';
  const lastTwo = Number(n % 100n);
  const suffix = lastTwo >= 11 && lastTwo <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[Number(n % 10n)] ?? 'th';
  return `${n}${suffix}`;
}

/** Empty fields are allowed; non-empty fields must be within bounds and to one decimal place. */
export function validateScore(text: string, maximum: number, label: string): string | null {
  if (!text.trim()) return null;
  const trimmed = text.trim();
  // Match Kotlin toDoubleOrNull numeric input behavior closely, without accepting Infinity/NaN.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return `${label} must be a number.`;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    return `${label} must be between 0 and ${Math.trunc(maximum)}.`;
  }
  const decimalPart = trimmed.split('.')[1]?.split(/[eE]/)[0] ?? '';
  if (decimalPart.length > 1 || (trimmed.includes('.') && decimalPart.length === 0)) {
    return `${label} allows one decimal place.`;
  }
  return null;
}

export function formatAverage(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

export interface PositionRow { studentId: string; position: number; classSize: number; }

/** Equal totals share a position; the next position skips occupied ranks (1, 1, 3). */
export function position(studentId: string, totals: Array<{ studentId: string; total: number }>): PositionRow | null {
  const current = totals.find((row) => row.studentId === studentId);
  if (!current) return null;
  const validTotals = totals.filter((row) => Number.isFinite(row.total));
  return {
    studentId,
    position: 1 + validTotals.filter((row) => row.total > current.total).length,
    classSize: validTotals.length
  };
}