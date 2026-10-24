import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import Papa from 'papaparse';

export type ScoreColumn = { index:number; subjectKey:string|null; field:'ca'|'exam'; header:string };
export type ScoreSheetRow = { lineNumber:number; admissionNo:string; fullName:string; values:string[] };
type Delimiter = ',' | ';';
export type ParsedScoreSheet = { headers:string[]; rows:ScoreSheetRow[]; columns:ScoreColumn[]; delimiter:Delimiter; warnings:string[] };
export type ScoreTemplateStudent = { admissionNo:string|null; fullName:string; scores:Record<string,{ca:number|null;exam:number|null}> };
export type ScoreTemplateSubject = { id:string; name:string };

export const normalizeScoreKey=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const normalizeScoreText=(value:unknown,delimiter:string)=>{let s=String(value??'').trim();if(!s)return '';if(delimiter===';' && /^[-+]?(?:\d+),(?:\d+)$/.test(s))s=s.replace(',','.');if(/^[-+]?\d+\.0+$/.test(s))s=String(Number(s));return s;};
function parseHeaderColumns(headers:string[]):ScoreColumn[]{
 const columns:ScoreColumn[]=[];
 headers.forEach((raw,index)=>{const h=normalizeScoreKey(raw).replace(/\s*\((?:30|70)\)\s*$/,'').trim();
  if(h==='ca'){columns.push({index,subjectKey:null,field:'ca',header:raw});return;}
  if(h==='exam'){columns.push({index,subjectKey:null,field:'exam',header:raw});return;}
  const match=h.match(/^(.*?)\s+(ca|exam)$/);if(match&&match[1].trim())columns.push({index,subjectKey:normalizeScoreKey(match[1]),field:match[2]==='ca'?'ca':'exam',header:raw});
 }); return columns;
}
function finish(headers:string[], data:string[][], delimiter:Delimiter):ParsedScoreSheet {
 if(!headers.length)throw new Error('The file is empty.');
 const clean=headers.map((h,i)=>i===0?h.replace(/^\uFEFF/,'').trim():String(h??'').trim());
 const admissionIdx=clean.findIndex(h=>['admission_no','admission no','admission number','admission number no','admissionno','admission'].includes(normalizeScoreKey(h).replace(/[._]/g,' '))||normalizeScoreKey(h)==='admission_no');
 const nameIdx=clean.findIndex(h=>['full_name','full name','name','student name','student_name','fullname'].includes(normalizeScoreKey(h)));
 const columns=parseHeaderColumns(clean);
 if(!columns.length)throw new Error('No score columns found. Use “Subject CA”, “Subject Exam”, “CA” or “Exam” headers.');
 if(admissionIdx<0&&nameIdx<0)throw new Error('The file must contain an admission_no or full_name column.');
 const warnings:string[]=[];
 const rows=data.map((cells,i)=>({lineNumber:i+2,admissionNo:admissionIdx>=0?String(cells[admissionIdx]??'').trim():'',fullName:nameIdx>=0?String(cells[nameIdx]??'').trim():'',values:clean.map((_,j)=>normalizeScoreText(cells[j],delimiter))})).filter(r=>r.admissionNo||r.fullName||r.values.some(Boolean));
 return {headers:clean,rows,columns,delimiter,warnings};
}
export function parseScoreCsv(text:string):ParsedScoreSheet {
 const source=text.replace(/^\uFEFF/,''); if(!source.trim())throw new Error('The file is empty.');
 const first=source.split(/\r?\n/,1)[0]??''; const commas=(first.match(/,/g)||[]).length, semis=(first.match(/;/g)||[]).length; const delimiter:Delimiter=semis>commas?';':',';
 const parsed=Papa.parse<string[]>(source,{delimiter,skipEmptyLines:'greedy',quoteChar:'"',escapeChar:'"'});
 if(parsed.errors.length)throw new Error(`Could not read CSV: ${parsed.errors[0].message}`);
 const rows=parsed.data as unknown as string[][];if(!rows.length)throw new Error('The file is empty.');
 return finish(rows[0].map(String),rows.slice(1),delimiter);
}
export async function parseScoreXlsx(bytes:Buffer|Uint8Array):Promise<ParsedScoreSheet>{
 const wb=new ExcelJS.Workbook();try{await wb.xlsx.load(Buffer.from(bytes) as any);}catch{throw new Error('Could not read this Excel workbook. Please use a valid .xlsx file or CSV.');}
 const sheet=wb.worksheets[0];if(!sheet)throw new Error('The workbook has no worksheet.');
 const headers:string[]=[];sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{headers[col-1]=String(cell.text??'').trim();});
 const rows:string[][]=[];for(let r=2;r<=sheet.rowCount;r++){const row=sheet.getRow(r);const vals:string[]=[];for(let c=1;c<=Math.max(headers.length,row.cellCount);c++){const cell=row.getCell(c);vals[c-1]=cell.value==null?'':typeof cell.value==='object'&&'text'in cell.value?String((cell.value as any).text):String(cell.text??cell.value??'');}rows.push(vals);}
 return finish(headers,rows,',');
}
export async function createScoreTemplate(format:'xlsx'|'csv',subjects:ScoreTemplateSubject[],students:ScoreTemplateStudent[]):Promise<Buffer>{
 const headers=['admission_no','full_name',...subjects.flatMap(s=>[`${s.name} CA (30)`,`${s.name} Exam (70)`])];
 const rows=students.map(st=>[st.admissionNo??'',st.fullName,...subjects.flatMap(s=>{const v=st.scores[s.id]??{ca:null,exam:null};return [v.ca==null?'':String(v.ca),v.exam==null?'':String(v.exam)];})]);
 if(format==='csv'){const csv=Papa.unparse([headers,...rows],{quotes:true,newline:'\r\n'});return Buffer.from('\uFEFF'+csv,'utf8');}
 const wb=new ExcelJS.Workbook();wb.creator='GDSS Dutse Results';wb.subject='Class score entry template';const sheet=wb.addWorksheet('Scores');sheet.addRow(headers);rows.forEach(r=>sheet.addRow(r));
 sheet.views=[{state:'frozen',ySplit:1,xSplit:2,activeCell:'C2'}];sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:headers.length}};
 sheet.getRow(1).height=42;sheet.getRow(1).eachCell((cell,col)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:col===1||col===2?'FF0B1F4B':col%2===1?'FF2563EB':'FF15803D'}};cell.border={bottom:{style:'medium',color:{argb:'FFD9AD45'}}};});
 sheet.getColumn(1).width=22;sheet.getColumn(2).width=Math.max(28,...students.map(s=>s.fullName.length+3));for(let i=3;i<=headers.length;i++){sheet.getColumn(i).width=Math.max(22,Math.min(34,headers[i-1].length+5));const isCa=(i-3)%2===0;for(let r=2;r<=Math.max(1000,rows.length+1);r++)sheet.getCell(r,i).dataValidation={type:'decimal',operator:'between',formulae:[0,isCa?30:70],allowBlank:true,showErrorMessage:true,errorTitle:'Invalid score',error:`Enter a number from 0 to ${isCa?30:70}.`};}
 return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ScoreImportValue = { studentId:string; subjectId:string; field:'ca'|'exam'; newScore:number };
export function saveImportedScores(db:Database.Database,classId:string,termId:string,entries:ScoreImportValue[]):{imported:number;skipped:number}{
 return db.transaction(()=>{
  const upsert=db.prepare('INSERT INTO scores(id,student_id,subject_id,term_id,ca,exam) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,term_id) DO UPDATE SET ca=excluded.ca,exam=excluded.exam');
  let imported=0,skipped=0;const seen=new Set<string>();
  for(const e of entries){const unique=`${e.studentId}::${e.subjectId}::${e.field}`;if(seen.has(unique)){skipped++;continue;}seen.add(unique);
   if(!Number.isFinite(e.newScore)||e.newScore<0||e.newScore>(e.field==='ca'?30:70)||Math.round(e.newScore*10)!==e.newScore*10){skipped++;continue;}
   const student=db.prepare('SELECT 1 FROM students WHERE id=? AND class_id=? AND is_active=1').get(e.studentId,classId);const subject=db.prepare('SELECT 1 FROM subjects WHERE id=? AND class_id=?').get(e.subjectId,classId);if(!student||!subject||!db.prepare('SELECT 1 FROM terms WHERE id=?').get(termId)){skipped++;continue;}
   const old=db.prepare('SELECT ca,exam FROM scores WHERE student_id=? AND subject_id=? AND term_id=?').get(e.studentId,e.subjectId,termId) as {ca:number|null;exam:number|null}|undefined;
   const ca=e.field==='ca'?e.newScore:(old?.ca??null),exam=e.field==='exam'?e.newScore:(old?.exam??null);
   upsert.run(randomUUID(),e.studentId,e.subjectId,termId,ca,exam);imported++;
  }
  return {imported,skipped};
 })();
}
