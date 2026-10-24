export type GradeInput = { grade: string; minScore: number; remark: string };
export function validateSessionName(name: string): string | null {
  const match = /^\s*(\d{4})\/(\d{4})\s*$/.exec(name);
  if (!match) return 'Session must use consecutive years, for example 2026/2027.';
  if (Number(match[2]) !== Number(match[1]) + 1) return 'Session years must be consecutive, for example 2026/2027.';
  return null;
}
export function validateGradingScale(rows: GradeInput[]): string | null {
  if (!rows.length) return 'Add at least one grading row.';
  const labels = new Set<string>(); const scores = new Set<number>();
  for (const [index, row] of rows.entries()) {
    const label = row.grade.trim().toLocaleUpperCase();
    if (!label) return `Grade label is required on row ${index + 1}.`;
    if (labels.has(label)) return `Duplicate grade label: ${label}.`;
    labels.add(label);
    if (row.minScore === null || row.minScore === undefined || !Number.isFinite(Number(row.minScore)) || Number(row.minScore) < 0 || Number(row.minScore) > 100) return `Minimum score on row ${index + 1} must be between 0 and 100.`;
    const score = Number(row.minScore);
    if (scores.has(score)) return `Duplicate minimum score: ${score}.`;
    scores.add(score);
    if (!row.remark.trim()) return `Remark is required on row ${index + 1}.`;
  }
  if (!rows.some((row) => Number(row.minScore) === 0)) return 'A grading row with minimum score 0 is required.';
  return null;
}
export function validateSchoolName(name: string): string | null { return name.trim() ? null : 'School name is required.'; }
export function validateLogo(fileName: string, sizeBytes: number): string | null {
  if (!/\.(png|jpe?g)$/i.test(fileName)) return 'Logo must be a PNG or JPG image.';
  if (sizeBytes <= 0 || sizeBytes > 5 * 1024 * 1024) return 'Logo must be larger than 0 bytes and no more than 5 MB.';
  return null;
}
export function nextSchoolLevel(level: string): string | null { return level === 'SS1' ? 'SS2' : level === 'SS2' ? 'SS3' : null; }
export type TraitInput = { name: string; group: 'skills' | 'behaviour' };
export function validateTraits(rows: TraitInput[]): string | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.name.trim()) return 'Trait names cannot be empty.';
    const key = `${row.group}:${row.name.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return `Duplicate ${row.group} trait: ${row.name.trim()}.`;
    seen.add(key);
  }
  return null;
}
export function validateTermDates(startDate: string | null, endDate: string | null, nextTermBegins: string | null): string | null {
  if (startDate && endDate && endDate < startDate) return 'Term end date cannot be before its start date.';
  if (endDate && nextTermBegins && nextTermBegins < endDate) return 'Next-term date cannot be before the term end date.';
  return null;
}
export function validatePromotion(sourceLevel: string, targetLevel: string): string | null {
  const expected = nextSchoolLevel(sourceLevel);
  if (!expected) return `${sourceLevel} has no higher level in this school model.`;
  return targetLevel === expected ? null : `Students from ${sourceLevel} can only be promoted to ${expected}.`;
}
