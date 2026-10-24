import { useEffect, useMemo, useState } from 'react';

type AnyRow = Record<string, any>;
type Props = { showMessage: (kind: 'success' | 'error', text: string) => void; onBack?: () => void };
type Progress = { done: number; total: number; currentName: string };

function labelTerm(term: AnyRow) { return `${term.name} · ${term.sessionName}`; }

export default function ReportCardsPage({ showMessage, onBack }: Props) {
  const [base, setBase] = useState<AnyRow | null>(null);
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [mode, setMode] = useState<'class' | 'student'>('class');
  const [studentId, setStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [order, setOrder] = useState<'name' | 'position'>('name');
  const [includeTypedRemarks, setIncludeTypedRemarks] = useState(true);
  const [separateFiles, setSeparateFiles] = useState(false);
  const [students, setStudents] = useState<AnyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [outputs, setOutputs] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    window.desktop.settingsGet().then((result: AnyRow) => {
      if (!alive) return;
      setBase(result);
      const currentClass = result.classes?.[0]?.id ?? '';
      const currentTerm = result.terms?.find((t: AnyRow) => t.isCurrent)?.id ?? result.terms?.[0]?.id ?? '';
      setClassId(currentClass); setTermId(currentTerm);
    }).catch((e) => showMessage('error', e instanceof Error ? e.message : 'Could not load report-card options.'));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!classId || !termId) { setStudents([]); return; }
    let alive = true;
    window.desktop.reportCardsGetData(classId, termId).then((data: AnyRow) => {
      if (!alive) return;
      setStudents(data.students ?? []);
      setStudentId((old) => data.students?.some((s: AnyRow) => s.id === old) ? old : data.students?.[0]?.id ?? '');
      setOutputs([]);
    }).catch((e) => showMessage('error', e instanceof Error ? e.message : 'Could not load students for report cards.'));
    return () => { alive = false; };
  }, [classId, termId]);

  useEffect(() => window.desktop.onReportCardsProgress((next) => setProgress(next)), []);
  const selectedClass = base?.classes?.find((c: AnyRow) => c.id === classId);
  const selectedTerm = base?.terms?.find((t: AnyRow) => t.id === termId);
  const filteredStudents = useMemo(() => students.filter((s) => `${s.fullName} ${s.admissionNo ?? ''}`.toLowerCase().includes(studentSearch.toLowerCase().trim())), [students, studentSearch]);

  const generate = async () => {
    if (!classId || !termId) { showMessage('error', 'Choose a class and term first.'); return; }
    if (!students.length) { showMessage('error', 'There are no active students in this class.'); return; }
    if (mode === 'student' && !studentId) { showMessage('error', 'Search for and select a student.'); return; }
    setBusy(true); setOutputs([]); setProgress({ done: 0, total: mode === 'student' ? 1 : students.length, currentName: 'Preparing report cards…' });
    try {
      const result = await window.desktop.reportCardsGenerate({ classId, termId, studentIds: mode === 'student' ? [studentId] : students.map((s) => s.id), order, includeTypedRemarks, separateFiles });
      if (result?.files?.length) {
        setOutputs(result.files);
        showMessage('success', separateFiles ? `${result.files.length} individual report-card PDFs saved.` : 'Report-card PDF saved.');
      } else if (!result?.cancelled) showMessage('error', 'Report-card generation did not produce a file.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not generate report cards.';
      if (!/cancel/i.test(message)) showMessage('error', message);
    } finally { setBusy(false); setProgress(null); }
  };

  const fileActions = async (action: 'open' | 'folder' | 'print') => {
    if (!outputs.length) return;
    try { await window.desktop.reportCardsFileAction(action, outputs); }
    catch (e) { showMessage('error', e instanceof Error ? e.message : 'Could not open the saved report.'); }
  };

  return <div className="report-cards-page">
    <div className="page-heading"><div><p className="eyebrow">RESULTS & REPORTS</p><h1>Report-card PDF</h1><p className="muted">Generate the school's terminal report sheet, one A4 portrait page per student.</p></div><div className="heading-actions">{onBack && <button className="button secondary" onClick={onBack}>← Back to results</button>}<button className="button primary" onClick={() => void generate()} disabled={busy || !classId || !termId}>▧ {busy ? 'Generating…' : 'Generate PDF'}</button></div></div>
    <section className="panel report-options-panel">
      <div className="report-select-grid">
        <label className="field"><span>Class</span><select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose class</option>{(base?.classes ?? []).map((c: AnyRow) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field"><span>Session & term</span><select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">Choose term</option>{(base?.terms ?? []).map((t: AnyRow) => <option key={t.id} value={t.id}>{labelTerm(t)}</option>)}</select></label>
      </div>
      <div className="report-context"><div><span>Selected class</span><strong>{selectedClass?.name ?? '—'}</strong></div><div><span>Term</span><strong>{selectedTerm ? labelTerm(selectedTerm) : '—'}</strong></div><div><span>Active students</span><strong>{students.length}</strong></div></div>
      <div className="report-option-section"><h2>Who should receive a report?</h2>
        <label className={`report-choice ${mode === 'class' ? 'selected' : ''}`}><input type="radio" name="report-mode" checked={mode === 'class'} onChange={() => setMode('class')} /><span><strong>Whole class</strong><small>Generate a report card for every active student.</small></span></label>
        <label className={`report-choice ${mode === 'student' ? 'selected' : ''}`}><input type="radio" name="report-mode" checked={mode === 'student'} onChange={() => setMode('student')} /><span><strong>Single student</strong><small>Search by student name or admission number.</small></span></label>
        {mode === 'student' && <div className="report-student-picker"><label className="field"><span>Search student</span><input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Name or admission number" /></label><label className="field"><span>Select student</span><select value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">Choose student</option>{filteredStudents.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.admissionNo ? ` · ${s.admissionNo}` : ''}</option>)}</select></label></div>}
      </div>
      <div className="report-option-section"><h2>Report settings</h2>
        <div className="report-select-grid"><label className="field"><span>Order reports by</span><select value={order} onChange={(e) => setOrder(e.target.value as 'name' | 'position')}><option value="name">Student name (A–Z)</option><option value="position">Class position</option></select></label><div className="report-checkboxes"><label className="checkbox-field"><input type="checkbox" checked={includeTypedRemarks} onChange={(e) => setIncludeTypedRemarks(e.target.checked)} /> Include typed class master and director remarks</label><label className="checkbox-field"><input type="checkbox" checked={separateFiles} onChange={(e) => setSeparateFiles(e.target.checked)} /> Save one PDF per student in a folder</label></div></div>
      </div>
      <p className="report-note">The report card uses the current saved scores, grading scale, ratings and school details. Empty scores remain blank. Reports are generated locally on this computer.</p>
    </section>
    {busy && <section className="panel report-progress-panel"><div className="report-progress-head"><strong>{progress?.currentName || 'Generating report cards…'}</strong><span>{progress?.done ?? 0} / {progress?.total ?? students.length}</span></div><div className="completion-track"><span style={{ width: `${progress?.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} /></div><div className="report-progress-actions"><small>The PDF is being generated in a separate utility process. The window should remain responsive.</small><button className="button danger-outline" onClick={() => void window.desktop.reportCardsCancel()}>Cancel</button></div></section>}
    {!!outputs.length && <section className="panel report-complete-panel"><div className="report-complete-icon">✓</div><div className="report-complete-copy"><h2>Report card{outputs.length === 1 ? '' : 's'} saved</h2><p>{outputs.length === 1 ? outputs[0] : `${outputs.length} PDF files saved in the selected folder.`}</p><div className="heading-actions"><button className="button primary" onClick={() => void fileActions('open')}>Open PDF</button><button className="button secondary" onClick={() => void fileActions('folder')}>Show in folder</button><button className="button secondary" onClick={() => void fileActions('print')}>Print</button></div></div></section>}
    {!students.length && classId && termId && <section className="panel empty-state"><strong>No active students in this class</strong><p>Add or activate students before generating report cards.</p></section>}
  </div>;
}
