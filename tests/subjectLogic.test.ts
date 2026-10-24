import { describe, expect, it } from 'vitest';
import { getSubjectsToCopy, hasDuplicateSubjectName, normalizeSubjectName } from '../src/core/subjectLogic';

describe('subject duplicate handling', () => {
  it('normalizes surrounding whitespace and case', () => {
    expect(normalizeSubjectName('  English Language ')).toBe('english language');
    expect(hasDuplicateSubjectName(['English Language', 'Mathematics'], ' english LANGUAGE ')).toBe(true);
  });
  it('allows different names and blank input is not considered a duplicate', () => {
    expect(hasDuplicateSubjectName(['English Language'], 'Biology')).toBe(false);
    expect(hasDuplicateSubjectName(['English Language'], '  ')).toBe(false);
  });
  it('returns only missing subjects when copying and removes duplicates within the source list', () => {
    expect(getSubjectsToCopy(
      ['English Language', 'Mathematics', 'BIOLOGY', ' Biology ', 'Chemistry'],
      ['english language', 'Physics']
    )).toEqual(['Mathematics', 'BIOLOGY', 'Chemistry']);
  });
  it('skips all subjects already present regardless of letter case', () => {
    expect(getSubjectsToCopy(['Hausa', 'hausa', 'Computer Studies'], ['HAUSA'])).toEqual(['Computer Studies']);
  });
  it('does not return blank source names', () => {
    expect(getSubjectsToCopy([' ', 'English Language'], [])).toEqual(['English Language']);
  });
});
