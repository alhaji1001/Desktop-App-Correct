import { gradeFor, average, position, ordinal, type GradingBand } from './resultCalculations';

export type ReportSubject = {id:string;name:string};
export type ReportStudent = {id:string;fullName:string;admissionNo:string|null};
export type ReportScore = {studentId:string;subjectId:string;ca:number|null;exam:number|null};
export type ReportRow = {studentId:string;fullName:string;admissionNo:string|null;total:number|null;average:number|null;subjectsCounted:number;position:number|null;positionLabel:string;incomplete:boolean;subjectTotals:Record<string,number|null>};
export function calculateClassResults(students:ReportStudent[],subjects:ReportSubject[],scores:ReportScore[],grades:GradingBand[]) {
 const rows:ReportRow[]=students.map(student=>{
  const subjectTotals:Record<string,number|null>={};let total=0;let counted=0;
  for(const subject of subjects){const score=scores.find(s=>s.studentId===student.id&&s.subjectId===subject.id);const val=score?.ca!=null&&score?.exam!=null?score.ca+score.exam:null;subjectTotals[subject.id]=val;if(val!=null){total+=val;counted++;}}
  const complete=subjects.length>0&&counted===subjects.length;
  return {studentId:student.id,fullName:student.fullName,admissionNo:student.admissionNo,total:complete?total:null,average:counted?total/counted:null,subjectsCounted:counted,position:null,positionLabel:'—',incomplete:!complete,subjectTotals};
 });
 const ranked=rows.filter(r=>!r.incomplete&&r.total!=null).map(r=>({studentId:r.studentId,total:r.total as number}));
 for(const row of rows){if(row.total==null)continue;const p=position(row.studentId,ranked);if(p){row.position=p.position;row.positionLabel=ordinal(p.position);}}
 const validTotals=rows.filter(r=>r.total!=null).map(r=>r.total as number);
 return {rows,statistics:{highest:validTotals.length?Math.max(...validTotals):null,lowest:validTotals.length?Math.min(...validTotals):null,classAverage:average(validTotals),rankedCount:ranked.length,incomplete:rows.filter(r=>r.incomplete)}};
}
