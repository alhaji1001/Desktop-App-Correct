import {describe,it,expect} from 'vitest';
import {calculateClassResults} from '../src/core/resultsReport';
const subjects=[{id:'math',name:'Mathematics'},{id:'eng',name:'English'}];
const grades=[{grade:'A',minScore:70,remark:'Excellent'},{grade:'F',minScore:0,remark:'Fail'}];
describe('results report calculations',()=>{
 it('uses ordinal positions with ties and skips the next occupied rank',()=>{
  const students=[{id:'a',fullName:'A',admissionNo:null},{id:'b',fullName:'B',admissionNo:null},{id:'c',fullName:'C',admissionNo:null},{id:'d',fullName:'D',admissionNo:null}];
  const scores=[{studentId:'a',subjectId:'math',ca:20,exam:60},{studentId:'a',subjectId:'eng',ca:20,exam:60},{studentId:'b',subjectId:'math',ca:20,exam:60},{studentId:'b',subjectId:'eng',ca:20,exam:60},{studentId:'c',subjectId:'math',ca:20,exam:50},{studentId:'c',subjectId:'eng',ca:20,exam:50},{studentId:'d',subjectId:'math',ca:20,exam:40},{studentId:'d',subjectId:'eng',ca:20,exam:40}];
  const result=calculateClassResults(students,subjects,scores,grades);expect(result.rows.map(r=>r.positionLabel)).toEqual(['1st','1st','3rd','4th']);expect(result.rows[0].total).toBe(160);expect(result.statistics.classAverage).toBe(145);
 });
 it('flags incomplete scores and excludes them from ranking while retaining counted subject totals',()=>{
  const students=[{id:'a',fullName:'A',admissionNo:null},{id:'b',fullName:'B',admissionNo:null}];
  const scores=[{studentId:'a',subjectId:'math',ca:20,exam:50},{studentId:'a',subjectId:'eng',ca:10,exam:50},{studentId:'b',subjectId:'math',ca:20,exam:null}];
  const result=calculateClassResults(students,subjects,scores,grades);expect(result.rows[0].total).toBe(130);expect(result.rows[0].positionLabel).toBe('1st');expect(result.rows[1].total).toBeNull();expect(result.rows[1].incomplete).toBe(true);expect(result.rows[1].subjectsCounted).toBe(0);expect(result.statistics.incomplete).toHaveLength(1);expect(result.statistics.rankedCount).toBe(1);
 });
 it('does not assign positions when there are no complete subject scores',()=>{const result=calculateClassResults([{id:'a',fullName:'A',admissionNo:null}],subjects,[],grades);expect(result.rows[0].positionLabel).toBe('—');expect(result.statistics.highest).toBeNull();});
});
