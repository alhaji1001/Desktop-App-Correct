import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ClipboardEvent } from 'react';
import { gradeFor, validateScore } from '../core/resultCalculations';

type AnyRow = Record<string, any>;
type Props = { showMessage: (kind:'success'|'error', text:string)=>void };
const key = (studentId:string, subjectId:string) => `${studentId}::${subjectId}`;
const numOrNull = (text:string): number|null => text.trim()==='' ? null : Number(text);

export default function ScoresPage({showMessage}:Props) {
  const [base,setBase] = useState<{classes:AnyRow[];terms:AnyRow[]}>({classes:[],terms:[]});
  const [classId,setClassId] = useState(''); const [termId,setTermId] = useState('');
  const [data,setData] = useState<any>(null); const [view,setView] = useState<'subject'|'student'>('subject');
  const [subjectId,setSubjectId] = useState(''); const [studentId,setStudentId] = useState('');
  const [cells,setCells] = useState<Record<string,{ca:string;exam:string}>>({});
  const [ratings,setRatings] = useState<Record<string,number>>({});
  const [remarks,setRemarks] = useState<Record<string,{classMasterRemark:string;directorRemark:string}>>({});
  const [errors,setErrors] = useState<Record<string,string>>({}); const [saved,setSaved] = useState<Record<string,'saving'|'saved'|'error'>>({});
  const [templateOpen,setTemplateOpen]=useState(false);const [templateSubject,setTemplateSubject]=useState('all');const [templateFormat,setTemplateFormat]=useState<'xlsx'|'csv'>('xlsx');
  const [importPreview,setImportPreview]=useState<any>(null);const [replaceExisting,setReplaceExisting]=useState(true);const [importBusy,setImportBusy]=useState(false);
  const timers = useRef<Record<string,number>>({}); const inputRefs = useRef<Record<string,HTMLInputElement|null>>({});

  const loadBase = useCallback(async () => {
    try {
      const settings=await window.desktop.settingsGet();
      const classes=await window.desktop.classesGet();
      const nextClasses=classes.classes ?? [];
      const terms=settings.terms ?? [];
      setBase({classes:nextClasses,terms});
      setClassId(old=>old || nextClasses[0]?.id || '');
      setTermId(old=>old || terms.find((t:any)=>t.isCurrent)?.id || terms[0]?.id || '');
    } catch(e) { showMessage('error', e instanceof Error?e.message:'Could not load score setup.'); }
  },[showMessage]);
  useEffect(()=>{void loadBase();},[loadBase]);

  const reload = useCallback(async (c=classId,t=termId) => {
    if (!c || !t) { setData(null); return; }
    try {
      const result=await window.desktop.scoresGet(c,t); setData(result);
      setSubjectId(old=>result.subjects.some((s:AnyRow)=>s.id===old)?old:result.subjects[0]?.id||'');
      setStudentId(old=>result.students.some((s:AnyRow)=>s.id===old)?old:result.students[0]?.id||'');
      const nextCells:Record<string,{ca:string;exam:string}>={};
      for(const s of result.students) for(const sub of result.subjects){const row=result.scores.find((r:AnyRow)=>r.studentId===s.id&&r.subjectId===sub.id);nextCells[key(s.id,sub.id)]={ca:row?.ca==null?'':String(row.ca),exam:row?.exam==null?'':String(row.exam)};}
      setCells(nextCells);
      const nextRatings:Record<string,number>={}; for(const r of result.ratings) nextRatings[`${r.studentId}::${r.traitId}`]=r.rating; setRatings(nextRatings);
      const nextRemarks:Record<string,{classMasterRemark:string;directorRemark:string}>={}; for(const r of result.remarks) nextRemarks[r.studentId]={classMasterRemark:r.classMasterRemark,directorRemark:r.directorRemark}; setRemarks(nextRemarks);
      setErrors({}); setSaved({});
    } catch(e) { showMessage('error',e instanceof Error?e.message:'Could not load scores.'); }
  },[classId,termId,showMessage]);
  useEffect(()=>{if(classId&&termId) void reload(classId,termId);},[classId,termId,reload]);
  useEffect(()=>()=>{Object.values(timers.current).forEach(window.clearTimeout);},[]);

  const saveCell = useCallback((sid:string,subid:string,next:{ca:string;exam:string})=>{
    const k=key(sid,subid); const caError=validateScore(next.ca,30,'CA'); const examError=validateScore(next.exam,70,'Exam');
    setErrors(old=>({...old,[`${k}:ca`]:caError||'', [`${k}:exam`]:examError||''}));
    if(caError||examError){setSaved(old=>({...old,[k]:'error'}));return;}
    setSaved(old=>({...old,[k]:'saving'}));
    if(timers.current[k]) window.clearTimeout(timers.current[k]);
    timers.current[k]=window.setTimeout(async()=>{
      try { await window.desktop.scoresSave({studentId:sid,subjectId:subid,termId,ca:numOrNull(next.ca),exam:numOrNull(next.exam)}); setSaved(old=>({...old,[k]:'saved'})); }
      catch(e){setSaved(old=>({...old,[k]:'error'}));showMessage('error',e instanceof Error?e.message:'Score could not be saved.');}
    },600);
  },[termId,showMessage]);

  const updateCell = (sid:string,subid:string,field:'ca'|'exam',value:string) => {
    const k=key(sid,subid); const next={...(cells[k]||{ca:'',exam:''}),[field]:value}; setCells(old=>({...old,[k]:next})); saveCell(sid,subid,next);
  };
  const grade = (sid:string,subid:string) => { const c=cells[key(sid,subid)]||{ca:'',exam:''}; if(c.ca.trim()===''||c.exam.trim()===''||validateScore(c.ca,30,'CA')||validateScore(c.exam,70,'Exam'))return null; return gradeFor(Number(c.ca)+Number(c.exam),data?.grades||[]); };
  const total = (sid:string,subid:string) => {const c=cells[key(sid,subid)]||{ca:'',exam:''};return c.ca.trim()!==''&&c.exam.trim()!==''&&!validateScore(c.ca,30,'CA')&&!validateScore(c.exam,70,'Exam')?Number(c.ca)+Number(c.exam):null;};
  const completion = useMemo(()=>{const denominator=(data?.students.length||0)*(data?.subjects.length||0)*2;if(!denominator)return 0;let filled=0;for(const c of Object.values(cells)){if(c.ca.trim()!==''&&!validateScore(c.ca,30,'CA'))filled++;if(c.exam.trim()!==''&&!validateScore(c.exam,70,'Exam'))filled++;}return Math.round(filled/denominator*100);},[cells,data]);
  const activeSubject = data?.subjects.find((s:AnyRow)=>s.id===subjectId); const activeStudent=data?.students.find((s:AnyRow)=>s.id===studentId);
  const openScoreImport=async()=>{if(!classId||!termId)return;try{setReplaceExisting(true);const result=await window.desktop.scoresChooseImport({classId,termId,selectedSubjectId:subjectId||null,replaceExisting:true});if(result){setImportPreview(result);setReplaceExisting(true);}}catch(e){showMessage('error',e instanceof Error?e.message:'Could not read score file.');}};
  const saveScoreTemplate=async()=>{if(!classId||!termId)return;try{const ok=await window.desktop.scoresDownloadTemplate({classId,termId,subjectId:templateSubject==='all'?null:templateSubject,format:templateFormat});if(ok)showMessage('success','Score template saved.');setTemplateOpen(false);}catch(e){showMessage('error',e instanceof Error?e.message:'Could not create score template.');}};
  const confirmScoreImport=async()=>{if(!importPreview)return;const entries=importPreview.entries.filter((e:any)=>!e.problem&&(replaceExisting||e.currentScore==null));if(!entries.length){showMessage('error','There are no valid scores to import.');return;}setImportBusy(true);try{const result=await window.desktop.scoresImportConfirm({classId,termId,entries:entries.map((e:any)=>({studentId:e.studentId,subjectId:e.subjectId,field:e.field,newScore:e.newScore}))});setImportPreview(null);await reload(classId,termId);showMessage('success',`Score import complete: ${result.imported} score cells imported, ${result.skipped} skipped.`);}catch(e){showMessage('error',e instanceof Error?e.message:'Score import failed.');}finally{setImportBusy(false);}};

  const handleCellKey = (e:KeyboardEvent<HTMLInputElement>,sid:string,subid:string,field:'ca'|'exam')=>{
    const all=data?.students.flatMap((st:AnyRow)=>data.subjects.flatMap((su:AnyRow)=>['ca','exam'].map((f:string)=>`${st.id}::${su.id}::${f}`)))||[];
    const current=`${sid}::${subid}::${field}`; const index=all.indexOf(current); let nextIndex=-1;
    if(e.key==='Enter'||e.key==='ArrowDown')nextIndex=Math.min(all.length-1,index+1);
    else if(e.key==='ArrowUp')nextIndex=Math.max(0,index-1);
    else if(e.key==='ArrowRight'&&e.currentTarget.selectionStart===e.currentTarget.value.length)nextIndex=Math.min(all.length-1,index+1);
    else if(e.key==='ArrowLeft'&&e.currentTarget.selectionStart===0)nextIndex=Math.max(0,index-1);
    else if(e.key==='Tab') { e.preventDefault(); nextIndex=Math.max(0,Math.min(all.length-1,index+(e.shiftKey?-1:1))); }
    if(nextIndex>=0){e.preventDefault();const [ns,nsub,nfield]=all[nextIndex].split('::'); if(view==='subject') {if(nsub!==subjectId)setSubjectId(nsub);} else if(ns!==studentId)setStudentId(ns); window.setTimeout(()=>inputRefs.current[all[nextIndex]]?.focus(),30);}
  };
  const handlePaste = (e:ClipboardEvent<HTMLInputElement>,sid:string,subid:string,field:'ca'|'exam')=>{
    const text=e.clipboardData.getData('text'); if(!text.includes('\n')&&!text.includes('\t'))return;
    e.preventDefault(); const values=text.trim().split(/\r?\n/).map(line=>line.split(/[\t,;]/)[0].trim());
    const studentIndex=data.students.findIndex((s:AnyRow)=>s.id===sid);
    values.forEach((value:string,i:number)=>{const target=data.students[studentIndex+i];if(target)updateCell(target.id,subid,field,value);});
  };
  const cellInput=(sid:string,subid:string,field:'ca'|'exam')=>{const id=`${sid}::${subid}::${field}`;const k=key(sid,subid);const c=cells[k]||{ca:'',exam:''};return <div className="score-cell-wrap" key={id}><input ref={el=>{inputRefs.current[id]=el;}} className={`score-input ${errors[`${k}:${field}`]?'invalid':''}`} aria-label={`${field==='ca'?'CA':'Exam'} for ${data.students.find((s:AnyRow)=>s.id===sid)?.fullName}`} inputMode="decimal" value={c[field]} onChange={e=>updateCell(sid,subid,field,e.target.value)} onKeyDown={e=>handleCellKey(e,sid,subid,field)} onPaste={e=>handlePaste(e,sid,subid,field)} />{errors[`${k}:${field}`]&&<small className="score-error">{errors[`${k}:${field}`]}</small>}</div>;};

  const saveRating=async(sid:string,traitId:string,value:number)=>{const k=`${sid}::${traitId}`;setRatings(old=>({...old,[k]:value}));try{await window.desktop.scoresSaveRating({studentId:sid,termId,traitId,rating:value});setSaved(old=>({...old,[`rating:${k}`]:'saved'}));}catch(e){showMessage('error',e instanceof Error?e.message:'Rating could not be saved.');}};
  const saveRemark=async(sid:string,field:'classMasterRemark'|'directorRemark',value:string)=>{const next={...(remarks[sid]||{classMasterRemark:'',directorRemark:''}),[field]:value};setRemarks(old=>({...old,[sid]:next}));const k=`remark:${sid}`;setSaved(old=>({...old,[k]:'saving'}));if(timers.current[k])window.clearTimeout(timers.current[k]);timers.current[k]=window.setTimeout(async()=>{try{await window.desktop.scoresSaveRemarks({studentId:sid,termId,...next});setSaved(old=>({...old,[k]:'saved'}));}catch(e){showMessage('error',e instanceof Error?e.message:'Remarks could not be saved.');}},600);};

  return <div className="page-content scores-page">
    <div className="page-heading scores-heading"><div><p className="eyebrow">ACADEMIC RECORDS</p><h1>Scores</h1><p className="muted">Enter continuous assessment, examinations, ratings and remarks. Changes save automatically on this computer.</p></div><div className="score-file-actions"><button className="button secondary" onClick={()=>setTemplateOpen(true)} disabled={!classId||!termId}>Template</button><button className="button primary" onClick={()=>void openScoreImport()} disabled={!classId||!termId}>Import scores</button></div></div>
    <section className="panel scores-toolbar"><label>Class<select value={classId} onChange={e=>setClassId(e.target.value)}><option value="">Choose class</option>{base.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Session · Term<select value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Choose term</option>{base.terms.map(t=><option key={t.id} value={t.id}>{t.sessionName} · {t.name}{t.isCurrent?' (Current)':''}</option>)}</select></label><div className="completion-box"><div><span>Class completion</span><strong>{completion}%</strong></div><div className="completion-track"><span style={{width:`${completion}%`}} /></div></div></section>
    {!classId||!termId?<div className="panel empty-state"><h2>Set up a class and term first</h2><p>Add classes, students, subjects and an academic session/term before entering scores.</p></div>:!data?<div className="panel empty-state">Loading scores…</div>:<>
      <div className="scores-view-tabs"><button className={view==='subject'?'selected':''} onClick={()=>setView('subject')}>Subject-first</button><button className={view==='student'?'selected':''} onClick={()=>setView('student')}>Student-first</button><span className="save-legend"><i/> Auto-saves after typing</span></div>
      {view==='subject'?<>
        <section className="panel scores-subject-bar"><label>Subject<select value={subjectId} onChange={e=>setSubjectId(e.target.value)}><option value="">Choose subject</option>{data.subjects.map((s:AnyRow)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><span>{data.students.length} students</span></section>
        {!activeSubject?<div className="panel empty-state"><h2>No subjects available</h2><p>Add subjects under Classes &amp; Subjects first.</p></div>:<div className="panel score-table-panel"><div className="table-scroll"><table className="score-table"><thead><tr><th className="student-name-col">Student</th><th>CA / 30</th><th>Exam / 70</th><th>Total / 100</th><th>Grade</th><th>Remark</th><th>Save status</th></tr></thead><tbody>{data.students.map((s:AnyRow)=><tr key={s.id}><td className="student-name-col"><strong>{s.fullName}</strong><small>{s.admissionNo||'No admission number'}</small></td><td>{cellInput(s.id,subjectId,'ca')}</td><td>{cellInput(s.id,subjectId,'exam')}</td><td className="total-cell">{total(s.id,subjectId)===null?'—':Number(total(s.id,subjectId)).toFixed(1)}</td><td><span className={`grade-pill ${grade(s.id,subjectId)?.grade==='F'?'grade-f':''}`}>{grade(s.id,subjectId)?.grade||'—'}</span></td><td>{grade(s.id,subjectId)?.remark||'—'}</td><td><span className={`saved-status ${saved[key(s.id,subjectId)]||''}`}>{saved[key(s.id,subjectId)]==='saving'?'Saving…':saved[key(s.id,subjectId)]==='error'?'Check entry':saved[key(s.id,subjectId)]==='saved'?'✓ Saved':'—'}</span></td></tr>)}</tbody></table></div>{!data.students.length&&<div className="empty-state"><p>No active students in this class.</p></div>}</div>}
      </>:<>
        <section className="panel scores-student-bar"><label>Student<select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Choose student</option>{data.students.map((s:AnyRow)=><option key={s.id} value={s.id}>{s.fullName}</option>)}</select></label>{activeStudent&&<div className="student-ident"><strong>{activeStudent.fullName}</strong><span>{activeStudent.admissionNo||'No admission number'}</span></div>}</section>
        {!activeStudent?<div className="panel empty-state">Choose a student to enter all subject scores and ratings.</div>:<div className="scores-student-layout"><section className="panel score-table-panel"><div className="panel-heading"><div><h2>Subject scores</h2><p className="muted">CA 0–30 · Exam 0–70</p></div></div><div className="table-scroll"><table className="score-table student-scores-table"><thead><tr><th>Subject</th><th>CA / 30</th><th>Exam / 70</th><th>Total</th><th>Grade</th><th>Remark</th></tr></thead><tbody>{data.subjects.map((sub:AnyRow)=><tr key={sub.id}><td><strong>{sub.name}</strong></td><td>{cellInput(studentId,sub.id,'ca')}</td><td>{cellInput(studentId,sub.id,'exam')}</td><td className="total-cell">{total(studentId,sub.id)===null?'—':Number(total(studentId,sub.id)).toFixed(1)}</td><td><span className={`grade-pill ${grade(studentId,sub.id)?.grade==='F'?'grade-f':''}`}>{grade(studentId,sub.id)?.grade||'—'}</span></td><td>{grade(studentId,sub.id)?.remark||'—'}</td></tr>)}</tbody></table></div></section>
        <section className="panel rating-panel"><div className="panel-heading"><div><h2>Student ratings</h2><p className="muted">Select a rating from 1 to 5.</p></div></div>{data.traits.length===0?<p className="muted">No traits configured yet. Add traits in Settings.</p>:<div className="trait-list">{data.traits.map((trait:AnyRow)=><div className="trait-row" key={trait.id}><div><strong>{trait.name}</strong><small>{trait.group==='skills'?'Psychomotor skills':'Behaviour'}</small></div><div className="rating-buttons">{[1,2,3,4,5].map(n=><button key={n} className={ratings[`${studentId}::${trait.id}`]===n?'active':''} aria-label={`${trait.name}: ${n}`} onClick={()=>void saveRating(studentId,trait.id,n)}>{n}</button>)}</div></div>)}</div>}
        <label className="remark-label">Class master remark<textarea rows={3} value={remarks[studentId]?.classMasterRemark||''} onChange={e=>saveRemark(studentId,'classMasterRemark',e.target.value)} placeholder="Optional remark" /></label><label className="remark-label">Director remark<textarea rows={3} value={remarks[studentId]?.directorRemark||''} onChange={e=>saveRemark(studentId,'directorRemark',e.target.value)} placeholder="Optional remark" /></label><div className="remarks-save-status">{saved[`remark:${studentId}`]==='saving'?'Saving remarks…':saved[`remark:${studentId}`]==='saved'?'✓ Remarks saved':''}</div></section></div>}
      </>}
    </>}
    {templateOpen&&<div className="modal-backdrop" role="presentation"><section className="modal-card score-file-modal" role="dialog" aria-modal="true" aria-labelledby="score-template-title"><div className="modal-header"><div><p className="eyebrow">SPREADSHEET</p><h2 id="score-template-title">Create score template</h2></div><button className="icon-button" onClick={()=>setTemplateOpen(false)} aria-label="Close">×</button></div><p className="muted">The file includes active students and their current scores for this term.</p><label>Subjects<select value={templateSubject} onChange={e=>setTemplateSubject(e.target.value)}><option value="all">All subjects</option>{(data?.subjects||[]).map((s:AnyRow)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><fieldset className="format-choice"><legend>File format</legend><label><input type="radio" checked={templateFormat==='xlsx'} onChange={()=>setTemplateFormat('xlsx')} /> Excel workbook (.xlsx) — recommended</label><label><input type="radio" checked={templateFormat==='csv'} onChange={()=>setTemplateFormat('csv')} /> CSV (.csv)</label></fieldset><div className="modal-actions"><button className="button secondary" onClick={()=>setTemplateOpen(false)}>Cancel</button><button className="button primary" onClick={()=>void saveScoreTemplate()}>Save template…</button></div></section></div>}
    {importPreview&&<div className="modal-backdrop score-import-backdrop" role="presentation"><section className="modal-card score-import-modal" role="dialog" aria-modal="true" aria-labelledby="score-import-title"><div className="modal-header"><div><p className="eyebrow">CHECK BEFORE SAVING</p><h2 id="score-import-title">Preview score import</h2></div><button className="icon-button" onClick={()=>setImportPreview(null)} aria-label="Close">×</button></div><div className="import-counts"><span><strong>{importPreview.entries.filter((e:any)=>!e.problem&&(replaceExisting||e.currentScore==null)).length}</strong> ready to import</span><span><strong>{importPreview.problemCount}</strong> problems</span><span><strong>{importPreview.entries.filter((e:any)=>!e.problem&&!replaceExisting&&e.currentScore!=null).length}</strong> existing scores skipped</span></div><label className="replace-switch"><input type="checkbox" checked={replaceExisting} onChange={e=>setReplaceExisting(e.target.checked)} /> Replace scores already entered <small>When off, only empty scores are filled. Blank cells never erase scores.</small></label>{importPreview.warnings?.length>0&&<div className="import-warnings"><strong>Warnings</strong>{importPreview.warnings.map((w:string,i:number)=><p key={i}>{w}</p>)}</div>}<div className="score-import-table-wrap"><table className="score-import-table"><thead><tr><th>Student</th><th>Subject</th><th>Field</th><th>Current</th><th>New score</th><th>Problem</th></tr></thead><tbody>{importPreview.entries.map((e:any)=><tr key={e.id} className={e.problem?'import-row-problem':''}><td>{e.studentName}{e.admissionNo&&<small>{e.admissionNo}</small>}</td><td>{e.subjectName}</td><td>{e.field.toUpperCase()}</td><td>{e.currentScore==null?'—':Number(e.currentScore).toFixed(1)}</td><td>{e.newScore==null?e.rawValue:Number(e.newScore).toFixed(1)}</td><td>{e.problem||(!replaceExisting&&e.currentScore!=null?'Existing score — will skip':'')}</td></tr>)}</tbody></table>{!importPreview.entries.length&&<div className="empty-state">No non-blank score cells were found in the file.</div>}</div><div className="modal-actions"><button className="button secondary" onClick={()=>setImportPreview(null)}>Cancel</button><button className="button primary" disabled={importBusy||!importPreview.entries.some((e:any)=>!e.problem&&(replaceExisting||e.currentScore==null))} onClick={()=>void confirmScoreImport()}>{importBusy?'Importing…':`Import ${importPreview.entries.filter((e:any)=>!e.problem&&(replaceExisting||e.currentScore==null)).length} score cells`}</button></div></section></div>}
  </div>;
}
