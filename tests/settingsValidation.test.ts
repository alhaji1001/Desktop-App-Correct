import { describe, expect, it } from 'vitest';
import { nextSchoolLevel, validateGradingScale, validateLogo, validatePromotion, validateSchoolName, validateSessionName, validateTermDates, validateTraits } from '../src/core/settingsValidation';
const validGrades = [
  { grade: 'A', minScore: 70, remark: 'Excellent' }, { grade: 'B', minScore: 60, remark: 'Very good' },
  { grade: 'C', minScore: 50, remark: 'Good' }, { grade: 'F', minScore: 0, remark: 'Fail' }
];
describe('school settings validation', () => {
  it('requires a school name', () => { expect(validateSchoolName('  ')).toBeTruthy(); expect(validateSchoolName('GDSS Dutse')).toBeNull(); });
  it('accepts consecutive session years only', () => { expect(validateSessionName('2026/2027')).toBeNull(); expect(validateSessionName('2026-2027')).toBeTruthy(); expect(validateSessionName('2026/2028')).toContain('consecutive'); expect(validateSessionName('abc')).toBeTruthy(); });
  it('rejects duplicate grade labels case-insensitively', () => { expect(validateGradingScale([...validGrades, { grade: 'a', minScore: 10, remark: 'duplicate' }])).toContain('Duplicate grade label'); });
  it('rejects duplicate minimum scores', () => { expect(validateGradingScale([...validGrades, { grade: 'D', minScore: 60, remark: 'duplicate' }])).toContain('Duplicate minimum score'); });
  it('requires score values between 0 and 100', () => { expect(validateGradingScale([{ grade: 'A', minScore: -1, remark: 'x' }])).toContain('between 0 and 100'); expect(validateGradingScale([{ grade: 'A', minScore: 101, remark: 'x' }])).toContain('between 0 and 100'); expect(validateGradingScale([{ grade: 'A', minScore: Number.NaN, remark: 'x' }])).toContain('between 0 and 100'); });
  it('requires a row with minimum score zero', () => { expect(validateGradingScale([{ grade: 'A', minScore: 70, remark: 'x' }])).toContain('score 0'); });
  it('requires a non-empty grade label, remark, and at least one row', () => { expect(validateGradingScale([])).toBeTruthy(); expect(validateGradingScale([{ grade: ' ', minScore: 0, remark: 'x' }])).toContain('label'); expect(validateGradingScale([{ grade: 'F', minScore: 0, remark: ' ' }])).toContain('Remark'); });
  it('accepts PNG/JPG logos up to 5 MB only', () => { expect(validateLogo('school.png', 100)).toBeNull(); expect(validateLogo('school.JPG', 5 * 1024 * 1024)).toBeNull(); expect(validateLogo('school.gif', 100)).toContain('PNG or JPG'); expect(validateLogo('school.jpg', 5 * 1024 * 1024 + 1)).toContain('5 MB'); expect(validateLogo('school.png', 0)).toContain('larger'); });
  it('validates term date order', () => { expect(validateTermDates('2026-09-01','2026-12-01','2027-01-05')).toBeNull(); expect(validateTermDates('2026-12-01','2026-09-01',null)).toContain('end date'); expect(validateTermDates(null,'2026-12-01','2026-11-01')).toContain('Next-term'); });
  it('validates non-empty, non-duplicate traits per group', () => { expect(validateTraits([{name:'Teamwork',group:'skills'},{name:'Respect',group:'behaviour'}])).toBeNull(); expect(validateTraits([{name:'',group:'skills'}])).toContain('cannot be empty'); expect(validateTraits([{name:'Respect',group:'skills'},{name:' respect ',group:'skills'}])).toContain('Duplicate'); expect(validateTraits([{name:'Respect',group:'skills'},{name:'Respect',group:'behaviour'}])).toBeNull(); });
  it('allows only one-level-up promotion', () => { expect(nextSchoolLevel('SS1')).toBe('SS2'); expect(nextSchoolLevel('SS2')).toBe('SS3'); expect(nextSchoolLevel('SS3')).toBeNull(); expect(validatePromotion('SS1','SS2')).toBeNull(); expect(validatePromotion('SS1','SS3')).toContain('SS2'); expect(validatePromotion('SS3','SS3')).toContain('no higher'); });
});
