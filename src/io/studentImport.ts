import Papa from 'papaparse';
import ExcelJS from 'exceljs';

export type ImportedStudentRow = { lineNumber: number; fullName: string; gender: string; admissionNo: string };
export type StudentImportStatus = 'OK' | 'duplicate admission number' | 'duplicate name in the class' | 'missing name' | 'invalid gender';
export type StudentImportPreviewRow = ImportedStudentRow & { statuses: StudentImportStatus[] };

const NAME_ALIASES = new Set(['full_name', 'full name', 'name', 'student name', 'student_name', 'fullname']);
const GENDER_ALIASES = new Set(['gender', 'sex']);
const ADMISSION_ALIASES = new Set(['admission_no', 'admission no', 'admission number', 'admission_no.', 'admission number no', 'admission number.', 'admissionno', 'admission #', 'admission_number', 'admission number (optional)']);
export function normalizeStudentHeader(value: unknown): string {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value && 'text' in value) return String((value as {text: unknown}).text ?? '').trim();
  if (typeof value === 'object' && value && 'result' in value) return String((value as {result: unknown}).result ?? '').trim();
  return String(value).trim();
}
function mapRecords(records: unknown[][], startLine = 1): ImportedStudentRow[] {
  const nonEmpty = records.map((cells, i) => ({ cells, lineNumber: startLine + i })).filter(({cells}) => cells.some((cell) => cellText(cell) !== ''));
  if (!nonEmpty.length) throw new Error('The file is empty or has no header row.');
  const headers = nonEmpty[0].cells.map(normalizeStudentHeader);
  const nameIndex = headers.findIndex((h) => NAME_ALIASES.has(h));
  const genderIndex = headers.findIndex((h) => GENDER_ALIASES.has(h));
  const admissionIndex = headers.findIndex((h) => ADMISSION_ALIASES.has(h));
  if (nameIndex < 0 || genderIndex < 0) throw new Error('Header row must include full_name (or name/student name) and gender (or sex).');
  return nonEmpty.slice(1).map(({cells, lineNumber}) => ({
    lineNumber,
    fullName: cellText(cells[nameIndex]),
    gender: cellText(cells[genderIndex]).toUpperCase(),
    admissionNo: admissionIndex < 0 ? '' : cellText(cells[admissionIndex])
  })).filter((row) => !/^EXAMPLE\s*:/i.test(row.fullName));
}

export function parseStudentCsv(input: string): { delimiter: ',' | ';'; rows: ImportedStudentRow[] } {
  const text = input.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new Error('The CSV file is empty.');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let quoted = false, commas = 0, semicolons = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"') { if (quoted && firstLine[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted && c === ',') commas++;
    else if (!quoted && c === ';') semicolons++;
  }
  // Papa Parse can recover from malformed quotes; reject unbalanced CSV quotes like the Android parser.
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    }
  }
  if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
  const delimiter: ',' | ';' = semicolons > commas ? ';' : ',';
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy', quoteChar: '"', escapeChar: '"', dynamicTyping: false });
  const missingQuotesError = result.errors.find((error) => error.code === 'MissingQuotes');
  if (missingQuotesError) throw new Error(`CSV contains an unterminated quoted field near row ${(missingQuotesError.row ?? 0) + 1}.`);
  const firstError = result.errors[0];
  if (firstError) throw new Error(`Could not read CSV row ${(firstError.row ?? 0) + 1}: ${firstError.message}`);
  return { delimiter, rows: mapRecords(result.data as unknown[][]) };
}

export async function parseStudentXlsx(buffer: Buffer | Uint8Array): Promise<ImportedStudentRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The Excel file has no worksheet.');
  const records: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = row.values;
    records.push(Array.isArray(values) ? values.slice(1) : Object.values(values).slice(1));
  });
  return mapRecords(records);
}

export function validateStudentImportRows( rows: ImportedStudentRow[], existing: Array<{ fullName: string; admissionNo: string | null; classId: string }>, targetClassId: string ): StudentImportPreviewRow[] {
  const seenAdmissions = new Set<string>();
  const seenNames = new Set<string>();
  const existingAdmissions = new Set(existing.map((s) => (s.admissionNo ?? '').trim().toLocaleLowerCase()).filter(Boolean));
  const existingNames = new Set(existing.filter((s) => s.classId === targetClassId).map((s) => s.fullName.trim().toLocaleLowerCase()));
  return rows.map((row) => {
    const statuses: StudentImportStatus[] = [];
    const name = row.fullName.trim().toLocaleLowerCase();
    const admission = row.admissionNo.trim().toLocaleLowerCase();
    const gender = row.gender.trim().toUpperCase();
    if (!name) statuses.push('missing name');
    if (gender !== 'M' && gender !== 'F') statuses.push('invalid gender');
    if (admission && (existingAdmissions.has(admission) || seenAdmissions.has(admission))) statuses.push('duplicate admission number');
    if (name && (existingNames.has(name) || seenNames.has(name))) statuses.push('duplicate name in the class');
    if (admission) seenAdmissions.add(admission);
    if (name) seenNames.add(name);
    return { ...row, fullName: row.fullName.trim(), gender, admissionNo: row.admissionNo.trim(), statuses: statuses.length ? statuses : ['OK'] };
  });
}

export async function createStudentTemplate(format: 'xlsx' | 'csv'): Promise<Buffer> {
  if (format === 'csv') return Buffer.from('\uFEFFfull_name,gender,admission_no\r\nEXAMPLE: Amina Bello,F,EXAMPLE-001\r\nEXAMPLE: Musa Danladi,M,EXAMPLE-002\r\n', 'utf8');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GDSS Dutse Results';
  const sheet = workbook.addWorksheet('Students');
  sheet.columns = [
    { header: 'full_name', key: 'full_name', width: 32 },
    { header: 'gender', key: 'gender', width: 14 },
    { header: 'admission_no', key: 'admission_no', width: 22 }
  ];
  sheet.addRows([
    { full_name: 'EXAMPLE: Amina Bello', gender: 'F', admission_no: 'EXAMPLE-001' },
    { full_name: 'EXAMPLE: Musa Danladi', gender: 'M', admission_no: 'EXAMPLE-002' }
  ]);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F4B' } };
  sheet.getRow(1).alignment = { vertical: 'middle' };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const worksheetValidations = (sheet as unknown as {
    dataValidations: {
      add: (range: string, validation: { type: 'list'; allowBlank: boolean; formulae: string[]; showErrorMessage: boolean; errorTitle: string; error: string; }) => void;
    };
  }).dataValidations;
  worksheetValidations.add('B2:B1000', { type: 'list', allowBlank: false, formulae: ['"M,F"'], showErrorMessage: true, errorTitle: 'Invalid gender', error: 'Choose M or F.' });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
