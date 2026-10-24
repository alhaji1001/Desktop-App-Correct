import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calculateReportCardSummaries, generateReportCards, type ReportCardData } from '../src/pdf/reportCard';

const tempDirs: string[] = [];
function tempDir() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdss-report-card-')); tempDirs.push(dir); return dir; }
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture(): ReportCardData {
  return {
    school: { schoolName: 'GDSS DUTSE', boardName: 'STATE BOARD', address: 'Dutse', logoPath: null },
    classInfo: { id: 'c1', name: 'SS1 A', classMasterName: 'Class Master' },
    term: { id: 't1', name: 'First Term', sessionName: '2026-2027', nextTermBegins: '2027-01-10' },
    students: [
      { id: 's1', fullName: 'Amina Bello', admissionNo: 'A01' },
      { id: 's2', fullName: 'Bala Musa', admissionNo: 'A02' },
      { id: 's3', fullName: 'Chika Okafor', admissionNo: 'A03' },
    ],
    subjects: [{ id: 'm', name: 'Mathematics' }, { id: 'e', name: 'English' }],
    scores: [
      { studentId: 's1', subjectId: 'm', ca: 25, exam: 65 }, { studentId: 's1', subjectId: 'e', ca: 20, exam: 70 },
      { studentId: 's2', subjectId: 'm', ca: 25, exam: 65 }, { studentId: 's2', subjectId: 'e', ca: 20, exam: 70 },
      { studentId: 's3', subjectId: 'm', ca: 20, exam: 50 },
    ],
    grades: [{ grade: 'A', minScore: 70, remark: 'Excellent' }, { grade: 'F', minScore: 0, remark: 'Fail' }],
    traits: [{ id: 'tr1', name: 'Neatness', group: 'skills', sortOrder: 0 }, { id: 'tr2', name: 'Punctuality', group: 'behaviour', sortOrder: 1 }],
    ratings: [{ studentId: 's1', traitId: 'tr1', rating: 5 }],
    remarks: [{ studentId: 's1', classMasterRemark: 'Excellent work', directorRemark: '' }],
  };
}

describe('report-card PDF', () => {
  it('uses ordinal tie positions and leaves incomplete students unranked', () => {
    const summaries = calculateReportCardSummaries(fixture());
    expect(summaries.get('s1')?.position).toBe(1);
    expect(summaries.get('s2')?.position).toBe(1);
    expect(summaries.get('s3')?.complete).toBe(false);
    expect(summaries.get('s3')?.position).toBeNull();
  });

  it('generates one A4 portrait page per selected student and uses whole-class position for a single student', async () => {
    const data = fixture();
    const out = path.join(tempDir(), 'report.pdf');
    const files = await generateReportCards(data, { studentIds: ['s2'], order: 'position', includeTypedRemarks: true, separateFiles: false }, out, path.resolve('build/report-assets'), () => {}, () => false);
    expect(files).toEqual([out]);
    const bytes = fs.readFileSync(out);
    expect(bytes.subarray(0, 8).toString('ascii')).toBe('%PDF-1.3');
    expect((bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  });

  it('creates separate PDF files for the selected students', async () => {
    const data = fixture();
    const dir = tempDir();
    const files = await generateReportCards(data, { studentIds: ['s1', 's2'], order: 'name', includeTypedRemarks: false, separateFiles: true }, dir, path.resolve('build/report-assets'), () => {}, () => false);
    expect(files).toHaveLength(2);
    expect(files.every((file) => fs.existsSync(file))).toBe(true);
  });
});
