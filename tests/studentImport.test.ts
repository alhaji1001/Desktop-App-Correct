import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { createStudentTemplate, parseStudentCsv, parseStudentXlsx, validateStudentImportRows, type ImportedStudentRow } from '../src/io/studentImport';

describe('student CSV parser (ported from CsvStudentParserTest.kt)', () => {
  it('parses UTF-8 BOM, aliases and trailing spaces', () => {
    const parsed=parseStudentCsv('\uFEFFname , sex , admission number\r\n Amina Bello , F , ADM-01  \r\n');
    expect(parsed.rows).toHaveLength(1); expect(parsed.rows[0]).toMatchObject({fullName:'Amina Bello',gender:'F',admissionNo:'ADM-01'});
  });
  it('parses quoted delimiters and escaped quotes', () => {
    const rows=parseStudentCsv('full_name,gender\n"Amina, Zainab",F\n"O""Neil Bello",M').rows;
    expect(rows[0].fullName).toBe('Amina, Zainab'); expect(rows[1].fullName).toBe('O"Neil Bello');
  });
  it('detects semicolon and permits missing optional admission column', () => {
    const parsed=parseStudentCsv('student name;sex\nMusa Danladi;M');
    expect(parsed.delimiter).toBe(';'); expect(parsed.rows[0].admissionNo).toBe('');
  });
  it('requires name and gender headers', () => { expect(()=>parseStudentCsv('full_name,admission_no\nAmina,1')).toThrow(/Header row must include/); });
  it('rejects unterminated quoted fields', () => { expect(()=>parseStudentCsv('full_name,gender\n"Amina,F')).toThrow(); });
  it('accepts the complete alias variants', () => {
    const rows=parseStudentCsv('student_name,sex,admission_no.\nSani Fati,M,A-2').rows;
    expect(rows[0]).toMatchObject({fullName:'Sani Fati',gender:'M',admissionNo:'A-2'});
  });
  it('handles messy whitespace, CRLF and blank lines', () => {
    const rows=parseStudentCsv('\uFEFFfull_name;gender;admission_no\r\n\r\n  Zainab Bello ; f ; A-3 \r\n').rows;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({fullName:'Zainab Bello',gender:'F',admissionNo:'A-3'});
  });
});

describe('student import validation', () => {
  const row=(fullName:string,gender:string,admissionNo=''):ImportedStudentRow=>({lineNumber:2,fullName,gender,admissionNo});
  it('marks duplicate admission numbers and duplicate names in the target class',()=>{
    const result=validateStudentImportRows([row('Amina','F','ADM-1'),row('Amina','F','ADM-2'),row('Musa','M','ADM-1')],[{fullName:'Existing',admissionNo:'ADM-3',classId:'c1'}],'c1');
    expect(result[1].statuses).toContain('duplicate name in the class'); expect(result[2].statuses).toContain('duplicate admission number');
  });
  it('marks missing names and invalid gender',()=>{
    const result=validateStudentImportRows([row('','X')],[],'c1'); expect(result[0].statuses).toEqual(['missing name','invalid gender']);
  });
  it('allows the same name in another class but not repeated within import',()=>{
    const result=validateStudentImportRows([row('Amina','F'),row('Amina','F')],[{fullName:'Amina',admissionNo:null,classId:'other'}],'c1');
    expect(result[0].statuses).toEqual(['OK']); expect(result[1].statuses).toContain('duplicate name in the class');
  });
});

describe('XLSX import and template', () => {
  it('template round-trips with headers, frozen header, M/F dropdown and marked example rows', async()=>{
    const bytes=await createStudentTemplate('xlsx'); const workbook=new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as never);
    const sheet=workbook.getWorksheet('Students')!;
    expect(sheet.getRow(1).values.slice(1)).toEqual(['full_name','gender','admission_no']);
    expect(sheet.views[0]).toMatchObject({state:'frozen',ySplit:1});
    expect(sheet.getCell('B2').dataValidation.formulae).toEqual(['"M,F"']); expect(sheet.getCell('B1000').dataValidation.formulae).toEqual(['"M,F"']);
    expect(String(sheet.getCell('A2').value)).toMatch(/^EXAMPLE:/);
    const parsed=await parseStudentXlsx(bytes); expect(parsed).toEqual([]); // example rows are never imported as real students
  });
  it('parses an XLSX file with extra columns and messy cell types', async()=>{
    const workbook=new ExcelJS.Workbook(); const sheet=workbook.addWorksheet('Upload');
    sheet.addRow(['Student Name','Sex','Admission Number','Unused']); sheet.addRow(['  Mary Musa  ','f','  007  ','ignored']);
    const bytes=Buffer.from(await workbook.xlsx.writeBuffer()); const rows=await parseStudentXlsx(bytes);
    expect(rows[0]).toMatchObject({fullName:'Mary Musa',gender:'F',admissionNo:'007'});
  });
  it('creates a UTF-8 BOM CSV template with clearly marked examples', async()=>{
    const bytes=await createStudentTemplate('csv'); const text=bytes.toString('utf8'); expect(text.charCodeAt(0)).toBe(0xFEFF); expect(text).toContain('EXAMPLE: Amina Bello');
    expect(parseStudentCsv(text).rows).toEqual([]);
  });
});
