import { describe, expect, it } from 'vitest';
import { average, formatAverage, gradeFor, ordinal, position, validateScore } from '../src/core/resultCalculations';

const grading = [
  { grade: 'A', minScore: 80, remark: 'Excellent' },
  { grade: 'B', minScore: 70, remark: 'Very Good' },
  { grade: 'C', minScore: 60, remark: 'Good' },
  { grade: 'D', minScore: 50, remark: 'Pass' },
  { grade: 'F', minScore: 0, remark: 'Fail' }
];

describe('Android ResultCalculations port', () => {
  it('selects the highest matching grade and rejects invalid totals', () => {
    expect(gradeFor(89, grading)?.grade).toBe('A');
    expect(gradeFor(70, grading)?.grade).toBe('B');
    expect(gradeFor(49.9, grading)?.grade).toBe('F');
    expect(gradeFor(null, grading)).toBeNull();
    expect(gradeFor(101, grading)).toBeNull();
    expect(gradeFor(Number.NaN, grading)).toBeNull();
  });
  it('averages finite present values and returns null when empty', () => {
    expect(average([70, null, 80])).toBe(75);
    expect(average([null, Number.NaN, null])).toBeNull();
  });
  it('formats ordinal suffixes including teens', () => {
    for (const [n, expected] of [[1,'1st'],[2,'2nd'],[3,'3rd'],[4,'4th'],[11,'11th'],[12,'12th'],[13,'13th'],[21,'21st'],[43,'43rd']] as const) {
      expect(ordinal(n)).toBe(expected);
    }
    expect(ordinal(0)).toBe('—');
  });
  it('matches Android score validation messages', () => {
    expect(validateScore('', 30, 'CA')).toBeNull();
    expect(validateScore('29.5', 30, 'CA')).toBeNull();
    expect(validateScore('30.1', 30, 'CA')).toBe('CA must be between 0 and 30.');
    expect(validateScore('abc', 70, 'Exam')).toBe('Exam must be a number.');
    expect(validateScore('1.25', 30, 'CA')).toBe('CA allows one decimal place.');
    expect(validateScore('30.', 30, 'CA')).toBe('CA allows one decimal place.');
  });
  it('calculates tied positions and class size', () => {
    const rows = [{ studentId: 'a', total: 90 }, { studentId: 'b', total: 90 }, { studentId: 'c', total: 75 }];
    expect(position('a', rows)).toEqual({ studentId: 'a', position: 1, classSize: 3 });
    expect(position('b', rows)?.position).toBe(1);
    expect(position('c', rows)?.position).toBe(3);
    expect(position('missing', rows)).toBeNull();
  });
  it('formats averages to two decimal places', () => {
    expect(formatAverage(75)).toBe('75.00');
    expect(formatAverage(null)).toBe('0.00');
  });
});