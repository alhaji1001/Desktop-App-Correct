import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import StudentsPage from './StudentsPage';
import ScoresPage from './ScoresPage';
import ResultsPage from './ResultsPage';

type Page = 'Dashboard' | 'Classes & Subjects' | 'Students' | 'Scores' | 'Results & Reports' | 'Settings' | 'Backup & Data';
type SetupData = {
  schoolName: string;
  address: string;
  phone: string;
  sessionName: string;
  termName: string;
  termNumber: number;
  classes: Array<{ name: string; level: 'SS1' | 'SS2' | 'SS3'; stream: string }>;
};
type StoredData = { setupComplete: boolean; setup: SetupData; currentPage: Page; };

const NAV_ITEMS: Array<{ page: Page; icon: string }> = [
  { page: 'Dashboard', icon: '▦' },
  { page: 'Classes & Subjects', icon: '▤' },
  { page: 'Students', icon: '♙' },
  { page: 'Scores', icon: '✓' },
  { page: 'Results & Reports', icon: '▧' },
  { page: 'Settings', icon: '⚙' },
  { page: 'Backup & Data', icon: '▣' }
];

const emptySetup: SetupData = {
  schoolName: 'GDSS Dutse', address: '', phone: '',
  sessionName: '', termName: 'First Term', termNumber: 1, classes: []
};

function readStored(): StoredData {
  try {
    const raw = localStorage.getItem('gdss-desktop-shell-v1');
    if (raw) return { ...JSON.parse(raw), setup: { ...emptySetup, ...JSON.parse(raw).setup } };
  } catch { /* use fresh setup */ }
  return { setupComplete: false, setup: emptySetup, currentPage: 'Dashboard' };
}

export default function App() {
  const [stored, setStored] = useState<StoredData>(readStored);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<SetupData>(stored.setup);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [version, setVersion] = useState('1.0.0');

  useEffect(() => {
    window.desktop?.getAppVersion().then(setVersion).catch(() => setVersion('1.0.0'));
  }, []);

  useEffect(() => {
    try { localStorage.setItem('gdss-desktop-shell-v1', JSON.stringify(stored)); }
    catch { setMessage({ kind: 'error', text: 'Could not save setup information on this computer.' }); }
  }, [stored]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const currentPage = stored.currentPage;
  const currentTermLabel = stored.setup.termName || 'No term selected';
  const currentSessionLabel = stored.setup.sessionName || 'No session selected';

  const showMessage = (kind: 'success' | 'error', text: string) => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 5000);
  };

  const changePage = (page: Page) => setStored((old) => ({ ...old, currentPage: page }));

  const completeWizard = async () => {
    if (!draft.schoolName.trim()) {
      showMessage('error', 'Enter the school name to continue.');
      setWizardStep(0);
      return;
    }
    if (!draft.sessionName.trim()) {
      showMessage('error', 'Enter the academic session to continue.');
      setWizardStep(1);
      return;
    }
    try {
      await window.desktop.setupComplete({ schoolName: draft.schoolName.trim(), address: draft.address, phone: draft.phone, sessionName: draft.sessionName.trim(), termNumber: draft.termNumber, classes: draft.classes.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })) });
      setStored({ setupComplete: true, setup: { ...draft, schoolName: draft.schoolName.trim(), sessionName: draft.sessionName.trim() }, currentPage: 'Dashboard' });
      showMessage('success', 'School setup saved to the local database.');
    } catch (error) { showMessage('error', error instanceof Error ? error.message : 'Could not save school setup.'); }
  };

  if (!stored.setupComplete) {
    return <SetupWizard
      draft={draft}
      setDraft={setDraft}
      step={wizardStep}
      setStep={setWizardStep}
      onFinish={completeWizard}
      message={message}
      clearMessage={() => setMessage(null)}
    />;
  }

  const pageContent = (() => {
    if (currentPage === 'Dashboard') {
      return <Dashboard onNavigate={changePage} showMessage={showMessage} />;
    }
    if (currentPage === 'Classes & Subjects') return <ClassesSubjectsPage search={search} showMessage={showMessage} />;
    if (currentPage === 'Students') return <StudentsPage search={search} showMessage={showMessage} />;
    if (currentPage === 'Scores') return <ScoresPage showMessage={showMessage} />;
    if (currentPage === 'Results & Reports') return <ResultsPage search={search} showMessage={showMessage} />;
    if (currentPage === 'Settings') return <SettingsPage showMessage={showMessage} />;
    return <BackupDataPage showMessage={showMessage} />;
  })();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">GD</div>
          <div><strong>GDSS Dutse</strong><span>Results Manager</span></div>
        </div>
        <nav aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <button key={item.page} className={`nav-item ${currentPage === item.page ? 'active' : ''}`} onClick={() => changePage(item.page)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.page}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">Offline desktop app <span>Version {version}</span></div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="school-context">
            <strong>{stored.setup.schoolName || 'GDSS Dutse'}</strong>
            <span>{currentSessionLabel} <i>·</i> {currentTermLabel}</span>
          </div>
          <div className="topbar-actions">
            <label className="search-box"><span aria-hidden="true">⌕</span><input id="global-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this page…" aria-label="Search this page" /><kbd>Ctrl+F</kbd></label>
          </div>
        </header>
        {message && <div className={`toast ${message.kind}`} role="status"><span>{message.kind === 'success' ? '✓' : '!'}</span>{message.text}<button onClick={() => setMessage(null)} aria-label="Dismiss message">×</button></div>}
        <main className="page-area">
          {pageContent}
        </main>
      </section>
    </div>
  );
}

function SetupWizard(props: {
  draft: SetupData;
  setDraft: (next: SetupData) => void;
  step: number;
  setStep: (step: number) => void;
  onFinish: () => void;
  message: { kind: 'success' | 'error'; text: string } | null;
  clearMessage: () => void;
}) {
  const { draft, setDraft, step, setStep, onFinish, message } = props;
  const update = (values: Partial<SetupData>) => setDraft({ ...draft, ...values });
  const steps = ['School details', 'Session & term', 'Add classes', 'Finish'];

  const addClass = () => update({ classes: [...draft.classes, { name: '', level: 'SS1', stream: '' }] });
  const updateClass = (index: number, values: Partial<SetupData['classes'][number]>) => {
    update({ classes: draft.classes.map((item, i) => i === index ? { ...item, ...values } : item) });
  };
  const removeClass = (index: number) => update({ classes: draft.classes.filter((_, i) => i !== index) });

  return <div className="wizard-screen">
    <div className="wizard-card">
      <div className="wizard-brand"><div className="brand-mark large">GD</div><div><strong>GDSS Dutse Results</strong><span>First-time setup · Works offline</span></div></div>
      <div className="wizard-progress" aria-label={`Step ${step + 1} of 4`}>
        {steps.map((label, index) => <div key={label} className={`wizard-step ${index === step ? 'current' : index < step ? 'complete' : ''}`}><span>{index < step ? '✓' : index + 1}</span><small>{label}</small></div>)}
      </div>
      {message && <div className={`inline-message ${message.kind}`}>{message.text}</div>}
      {step === 0 && <section className="wizard-content">
        <p className="eyebrow">STEP 1 OF 4</p><h1>School details</h1><p className="muted">Enter the details that appear on your school records.</p>
        <Field label="School name *"><input autoFocus value={draft.schoolName} onChange={(e) => update({ schoolName: e.target.value })} placeholder="GDSS Dutse" /></Field>
        <Field label="School address"><input value={draft.address} onChange={(e) => update({ address: e.target.value })} placeholder="School address (optional)" /></Field>
        <Field label="Phone number"><input value={draft.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="Phone number (optional)" /></Field>
      </section>}
      {step === 1 && <section className="wizard-content">
        <p className="eyebrow">STEP 2 OF 4</p><h1>Session & term</h1><p className="muted">Set the academic period you are currently managing.</p>
        <Field label="Academic session *"><input autoFocus value={draft.sessionName} onChange={(e) => update({ sessionName: e.target.value })} placeholder="e.g. 2026/2027" /></Field>
        <Field label="Current term"><select value={draft.termNumber} onChange={(e) => update({ termNumber: Number(e.target.value), termName: ['First Term', 'Second Term', 'Third Term'][Number(e.target.value) - 1] })}><option value={1}>First Term</option><option value={2}>Second Term</option><option value={3}>Third Term</option></select></Field>
        <div className="info-panel">You can manage other sessions and terms later in Settings.</div>
      </section>}
      {step === 2 && <section className="wizard-content">
        <p className="eyebrow">STEP 3 OF 4</p><h1>Add classes</h1><p className="muted">You can add classes now or do this later.</p>
        <div className="class-draft-list">
          {draft.classes.map((item, index) => <div className="class-draft-row" key={index}>
            <input aria-label={`Class ${index + 1} name`} value={item.name} onChange={(e) => updateClass(index, { name: e.target.value })} placeholder="e.g. SS1 A" />
            <select aria-label={`Class ${index + 1} level`} value={item.level} onChange={(e) => updateClass(index, { level: e.target.value as 'SS1'|'SS2'|'SS3' })}><option>SS1</option><option>SS2</option><option>SS3</option></select>
            <input aria-label={`Class ${index + 1} stream`} value={item.stream} onChange={(e) => updateClass(index, { stream: e.target.value })} placeholder="Stream (optional)" />
            <button className="icon-button danger-text" onClick={() => removeClass(index)} aria-label={`Remove class ${index + 1}`}>×</button>
          </div>)}
        </div>
        <button className="button secondary" onClick={addClass}>＋ Add a class</button>
      </section>}
      {step === 3 && <section className="wizard-content">
        <p className="eyebrow">STEP 4 OF 4</p><h1>Ready to begin</h1><p className="muted">Review your setup. You can change these details later.</p>
        <div className="review-list">
          <ReviewRow label="School" value={draft.schoolName || 'Not entered'} />
          <ReviewRow label="Session" value={draft.sessionName || 'Not entered'} />
          <ReviewRow label="Current term" value={draft.termName} />
          <ReviewRow label="Classes added" value={String(draft.classes.filter((c) => c.name.trim()).length)} />
        </div>
        <div className="info-panel success-panel">Your setup is saved locally on this computer. No account or internet connection is needed.</div>
      </section>}
      <footer className="wizard-footer">
        <button className="button secondary" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</button>
        <span className="step-count">{step + 1} of 4</span>
        {step < 3 ? <button className="button primary" onClick={() => {
          if (step === 0 && !draft.schoolName.trim()) return;
          if (step === 1 && !draft.sessionName.trim()) return;
          setStep(step + 1);
        }}>Continue <span>→</span></button> : <button className="button primary" onClick={onFinish}>Finish setup <span>✓</span></button>}
      </footer>
    </div>
    <p className="wizard-footnote">GDSS Dutse Results <span>·</span> Your data stays on this computer</p>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="review-row"><span>{label}</span><strong>{value}</strong></div>;
}

type DashboardSnapshot = { totalStudents:number; totalSubjects:number; totalClasses:number; currentTerm?:{id:string;name:string}; classes:Array<{id:string;name:string;level:string;stream:string|null;activeStudents:number;subjectCount:number;completeScores:number;percent:number;progressLabel:string}> };
function Dashboard({ onNavigate, showMessage }: { onNavigate: (page: Page) => void; showMessage: (kind: 'success'|'error', text: string) => void }) {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const refresh = async () => { setData(await window.desktop.dashboardGet() as DashboardSnapshot); setLoading(false); };
  useEffect(() => { void refresh().catch((error) => { setLoading(false); showMessage('error', error instanceof Error ? error.message : 'Could not load dashboard.'); }); }, []);
  const classes = (data?.classes ?? []).filter((item) => !search.trim() || `${item.name} ${item.level} ${item.stream ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="dashboard">
    <div className="page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>Dashboard</h1><p className="muted">Live figures from the records saved on this computer.</p></div><button className="button primary" onClick={() => onNavigate('Students')}>＋ Add student</button></div>
    <div className="stat-grid"><StatCard icon="♙" label="Total students" value={loading ? '…' : String(data?.totalStudents ?? 0)} note="Active student records"/><StatCard icon="▤" label="Classes" value={loading ? '…' : String(data?.totalClasses ?? 0)} note="Classes in the database"/><StatCard icon="▧" label="Subjects" value={loading ? '…' : String(data?.totalSubjects ?? 0)} note="Subject records across classes"/></div>
    <section className="panel progress-panel"><div className="section-heading"><div><h2>Score-entry progress</h2><p className="muted">{data?.currentTerm?.name ?? 'No current term selected'} · By class</p></div><button className="text-button" onClick={() => onNavigate('Scores')}>Open scores →</button></div>
      {loading ? <div className="level-empty">Loading saved progress…</div> : classes.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><strong>No classes added yet</strong><p>Add your classes to track score-entry progress here.</p><button className="button secondary" onClick={() => onNavigate('Classes & Subjects')}>Go to Classes & Subjects</button></div> : <div className="progress-list">{classes.map((item) => <button className="progress-row" key={item.id} onClick={() => onNavigate('Scores')}><span className="class-badge">{item.level}</span><span className="progress-class-name">{item.name}</span><span className="progress-track"><span style={{width:`${item.percent}%`}}/></span><span className="progress-count">{item.progressLabel}</span><span className="row-chevron">›</span></button>)}</div>}
    </section>
    <section className="quick-section"><div className="section-heading"><div><h2>Quick actions</h2><p className="muted">Common tasks, one click away.</p></div></div><div className="quick-grid">
      <QuickAction icon="＋" title="Add student" description="Create a student record" onClick={() => onNavigate('Students')}/><QuickAction icon="⇧" title="Import students" description="Import from an Excel or CSV file" onClick={() => onNavigate('Students')}/><QuickAction icon="✓" title="Enter scores" description="Record CA and exam marks" onClick={() => onNavigate('Scores')}/><QuickAction icon="▧" title="Generate report cards" description="Print or save class reports" onClick={() => onNavigate('Results & Reports')}/><QuickAction icon="▣" title="Backup now" description="Make a safe copy of your data" onClick={() => onNavigate('Backup & Data')}/>
    </div></section>
  </div>;
}

function StatCard({ icon, label, value, note }: { icon: string; label: string; value: string; note: string }) {
  return <article className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-label">{label}</span></div><strong className="stat-value">{value}</strong><p>{note}</p></article>;
}
function QuickAction({ icon, title, description, onClick }: { icon: string; title: string; description: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className="quick-icon">{icon}</span><span className="quick-copy"><strong>{title}</strong><small>{description}</small></span><span className="row-chevron">›</span></button>;
}
type ManagedClass = { id: string; name: string; level: 'SS1'|'SS2'|'SS3'; stream: string | null; classMasterName: string | null; sortOrder: number; studentCount: number; subjectCount: number };
type ManagedStudent = { id: string; classId: string; fullName: string; admissionNo: string | null; isActive: number | boolean };
type ManagedSubject = { id: string; classId: string; name: string; sortOrder: number };
type ClassesSnapshot = { classes: ManagedClass[]; students: ManagedStudent[]; subjects: ManagedSubject[] };
const QUICK_SUBJECTS = ['English Language','Mathematics','Biology','Chemistry','Physics','Civic Education','Data Processing','Hausa','Food and Nutrition','Further Mathematics','Economics','Geography','Government','Literature in English','Agricultural Science','Islamic Studies','Computer Studies'];
function ClassesSubjectsPage({ search, showMessage }: { search: string; showMessage: (kind: 'success'|'error', text: string) => void }) {
  const [data, setData] = useState<ClassesSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<'Students'|'Subjects'>('Subjects');
  const [newSubject, setNewSubject] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = async (keepSelection = true) => {
    const snapshot = await window.desktop.classesGet() as ClassesSnapshot;
    setData(snapshot);
    const preferred = keepSelection ? selectedId : '';
    setSelectedId(snapshot.classes.some((c) => c.id === preferred) ? preferred : '');
    setLoading(false);
  };
  useEffect(() => { void refresh(false).catch((e) => { setLoading(false); showMessage('error', e instanceof Error ? e.message : 'Could not load classes.'); }); }, []);
  const act = async (operation: () => Promise<unknown>, success: string) => {
    try { await operation(); await refresh(); showMessage('success', success); }
    catch (e) { showMessage('error', e instanceof Error ? e.message : 'The operation could not be completed.'); }
  };
  const selected = data?.classes.find((c) => c.id === selectedId);
  const classSubjects = (data?.subjects ?? []).filter((s) => s.classId === selectedId).sort((a,b) => a.sortOrder-b.sortOrder || a.name.localeCompare(b.name));
  const classStudents = (data?.students ?? []).filter((st) => st.classId === selectedId).filter((st) => !search.trim() || `${st.fullName} ${st.admissionNo ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const filteredClasses = (data?.classes ?? []).filter((c) => !search.trim() || `${c.name} ${c.level} ${c.stream ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const addStream = (level: 'SS1'|'SS2'|'SS3') => { void (async () => { try { const row = await window.desktop.classesAddStream(level) as ManagedClass; await refresh(false); setSelectedId(row.id); showMessage('success', `${level} stream added.`); } catch (e) { showMessage('error', e instanceof Error ? e.message : 'Could not add class stream.'); } })(); };
  const deleteClass = (schoolClass: ManagedClass) => {
    if (schoolClass.studentCount > 0) { showMessage('error', 'This class cannot be deleted while it has students.'); return; }
    if (window.confirm(`Delete ${schoolClass.name}? This class must be empty. Its subjects and any related scores will also be deleted.`)) void act(() => window.desktop.classesDelete(schoolClass.id), `${schoolClass.name} deleted.`);
  };
  const addSubject = (name: string) => {
    if (!selectedId) return;
    void act(async () => { await window.desktop.subjectsAdd(selectedId, name); setNewSubject(''); }, `${name.trim()} added.`);
  };
  const startCopy = () => { setCopySourceId(selectedId); setCopyTargets([]); setCopyOpen(true); };
  const sourceForCopy = data?.classes.find((c) => c.id === copySourceId);
  const copyTo = async () => {
    try { const count = await window.desktop.subjectsCopy(copySourceId, copyTargets); await refresh(); setCopyOpen(false); showMessage('success', `${count} subject${count === 1 ? '' : 's'} added across the selected classes. Existing subjects were skipped.`); }
    catch (e) { showMessage('error', e instanceof Error ? e.message : 'Could not copy subjects.'); }
  };
  if (loading || !data) return <div className="placeholder-page"><h1>Classes & Subjects</h1><div className="panel settings-panel">Loading classes saved on this computer…</div></div>;
  return <div className="classes-workspace">
    <div className="page-heading"><div><p className="eyebrow">ACADEMIC STRUCTURE</p><h1>Classes & Subjects</h1><p className="muted">Manage class streams and the subjects taught in each class.</p></div><div className="stream-actions">{(['SS1','SS2','SS3'] as const).map((level) => <button className="button secondary" key={level} onClick={() => addStream(level)}>＋ {level} stream</button>)}</div></div>
    <div className="classes-level-grid">{(['SS1','SS2','SS3'] as const).map((level) => { const rows = filteredClasses.filter((c) => c.level === level); return <section className="level-section" key={level}><div className="level-title"><h2>{level}</h2><span>{rows.length} stream{rows.length === 1 ? '' : 's'}</span></div>{rows.length === 0 ? <div className="level-empty">No classes yet. Add a stream above.</div> : rows.map((c) => <article key={c.id} className={`class-card ${selectedId === c.id ? 'selected' : ''}`}><button className="class-card-main" onClick={() => { setSelectedId(c.id); setTab('Subjects'); }}><strong>{c.name}</strong><span className="class-stream-label">Stream {c.stream ?? '—'}</span><span className="class-counts"><i>{c.studentCount} students</i><i>{c.subjectCount} subjects</i></span></button><button className="icon-button danger-text" title={c.studentCount ? 'Class must be empty before deleting' : 'Delete class'} aria-label={`Delete ${c.name}`} disabled={c.studentCount > 0} onClick={() => deleteClass(c)}>×</button></article>)}</section>; })}</div>
    {selected && <section className="panel class-detail-panel"><div className="class-detail-heading"><div><p className="eyebrow">CLASS DETAILS</p><h2>{selected.name}</h2><p className="muted">{selected.studentCount} students · {selected.subjectCount} subjects</p></div><button className="button secondary" onClick={() => setSelectedId('')}>Close details</button></div>
      <div className="class-master-edit"><Field label="Class master name (optional; printed on report cards)"><input value={selected.classMasterName ?? ''} onChange={(e) => setData((old) => old ? { ...old, classes: old.classes.map((c) => c.id === selected.id ? { ...c, classMasterName: e.target.value } : c) } : old)} placeholder="Enter class master's name" /></Field><button className="button secondary" onClick={() => void act(() => window.desktop.classesSaveMaster(selected.id, selected.classMasterName ?? ''), 'Class master name saved.')}>Save name</button></div>
      <div className="detail-tabs"><button className={tab === 'Students' ? 'active' : ''} onClick={() => setTab('Students')}>Students ({selected.studentCount})</button><button className={tab === 'Subjects' ? 'active' : ''} onClick={() => setTab('Subjects')}>Subjects ({classSubjects.length})</button></div>
      {tab === 'Students' ? <div className="class-student-list">{classStudents.length ? classStudents.map((st) => <div className="class-student-row" key={st.id}><span className="student-initial">{st.fullName.trim().charAt(0).toUpperCase()}</span><div><strong>{st.fullName}</strong><small>{st.admissionNo || 'No admission number'} · {st.isActive ? 'Active' : 'Inactive'}</small></div></div>) : <div className="level-empty">No students in this class yet.</div>}</div> : <>
        <div className="subject-toolbar"><div className="subject-add-row"><input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSubject(newSubject); }} placeholder="Enter a subject name" aria-label="New subject name"/><button className="button primary" onClick={() => addSubject(newSubject)}>＋ Add subject</button></div><button className="button secondary" onClick={startCopy}>Copy subjects to other classes</button></div>
        <div className="quick-subjects"><strong>Quick add</strong><div>{QUICK_SUBJECTS.filter((name) => !classSubjects.some((s) => s.name.trim().toLowerCase() === name.toLowerCase())).map((name) => <button key={name} className="quick-subject-chip" onClick={() => addSubject(name)}>＋ {name}</button>)}</div></div>
        {classSubjects.length === 0 ? <div className="level-empty">No subjects yet. Add a custom subject or choose from Quick add.</div> : <div className="subject-list">{classSubjects.map((subject,index) => <div className="subject-row" key={subject.id}><span className="subject-number">{index+1}</span>{editingId === subject.id ? <input className="subject-edit-input" value={editingName} autoFocus onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void act(async () => { await window.desktop.subjectsRename(subject.id, selected.id, editingName); setEditingId(''); }, 'Subject renamed.'); if (e.key === 'Escape') setEditingId(''); }} /> : <strong>{subject.name}</strong>}<div className="subject-row-actions">{editingId === subject.id ? <><button className="icon-button" aria-label="Save subject name" onClick={() => void act(async () => { await window.desktop.subjectsRename(subject.id, selected.id, editingName); setEditingId(''); }, 'Subject renamed.')}>✓</button><button className="icon-button" onClick={() => setEditingId('')} aria-label="Cancel rename">×</button></> : <><button className="icon-button" disabled={index===0} aria-label={`Move ${subject.name} up`} onClick={() => void act(() => window.desktop.subjectsMove(selected.id, subject.id, -1), 'Subject order updated.')}>↑</button><button className="icon-button" disabled={index===classSubjects.length-1} aria-label={`Move ${subject.name} down`} onClick={() => void act(() => window.desktop.subjectsMove(selected.id, subject.id, 1), 'Subject order updated.')}>↓</button><button className="icon-button" aria-label={`Rename ${subject.name}`} onClick={() => { setEditingId(subject.id); setEditingName(subject.name); }}>✎</button><button className="icon-button danger-text" aria-label={`Delete ${subject.name}`} onClick={() => { if (window.confirm(`Delete ${subject.name}? This also deletes all scores of this subject. This action cannot be undone.`)) void act(() => window.desktop.subjectsDelete(subject.id), 'Subject and its scores deleted.'); }}>×</button></>}</div></div>)}</div>}
      </>}
    </section>}
    {copyOpen && <div className="modal-backdrop" role="presentation"><section className="copy-modal" role="dialog" aria-modal="true" aria-labelledby="copy-title"><h2 id="copy-title">Copy subjects to classes</h2><p className="muted">Choose one or more destination classes. Existing subjects are skipped without creating duplicates.</p>{(data.classes.filter((c) => c.id !== copySourceId)).map((c) => <label className="copy-target-row" key={c.id}><input type="checkbox" checked={copyTargets.includes(c.id)} onChange={(e) => setCopyTargets((old) => e.target.checked ? [...old,c.id] : old.filter((id) => id !== c.id))}/><span><strong>{c.name}</strong><small>{c.subjectCount} current subjects</small></span></label>)}{data.classes.length < 2 && <p className="level-empty">Add another class before copying subjects.</p>}<footer><button className="button secondary" onClick={() => setCopyOpen(false)}>Cancel</button><button className="button primary" disabled={!copyTargets.length || !sourceForCopy} onClick={() => void copyTo()}>Copy to {copyTargets.length} class{copyTargets.length===1?'':'es'}</button></footer></section></div>}
  </div>;
}

function BackupDataPage({ showMessage }: { showMessage: (kind: 'success'|'error', text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); try { const result = await window.desktop.backupCreate(); if (!result.cancelled && result.path) showMessage('success', `Backup saved: ${result.path}`); } catch (error) { showMessage('error', error instanceof Error ? error.message : 'Backup could not be created.'); } finally { setBusy(false); } };
  const restore = async () => { setBusy(true); try { const result = await window.desktop.backupRestore(); if (result.cancelled) return; showMessage('success', `Backup restored. A safety copy was saved${result.safetyCopy ? ` at ${result.safetyCopy}` : ''}. Reloading records…`); window.setTimeout(() => window.location.reload(), 1200); } catch (error) { showMessage('error', error instanceof Error ? error.message : 'Backup could not be restored.'); } finally { setBusy(false); } };
  return <div className="settings-page"><div className="page-heading"><div><p className="eyebrow">LOCAL DATA SAFETY</p><h1>Backup & Data</h1><p className="muted">Create a portable backup or restore data on this computer. No internet is needed.</p></div></div>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Create a backup</h2><p className="muted">Save a copy of your students, classes, subjects, scores, settings and report-card data to a location you choose.</p></div></div><div className="settings-actions"><button className="button primary" disabled={busy} onClick={() => void create()}>{busy ? 'Please wait…' : 'Create backup (.db)'}</button></div><p className="settings-footnote">A daily automatic safety backup is also kept in the app's local data folder (up to 14 days). Copy your manual backup to a USB drive or another safe location.</p></section>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Restore a backup</h2><p className="muted">Choose a previous .db backup. The app creates a safety copy of current data before replacing it.</p></div></div><div className="info-panel">Restoring replaces the records currently on this computer. Make sure the selected file is the correct school backup.</div><div className="settings-actions"><button className="button secondary" disabled={busy} onClick={() => void restore()}>{busy ? 'Please wait…' : 'Choose backup and restore'}</button></div></section>
    <section className="panel settings-panel"><h2>Data storage</h2><p className="muted">Your database is stored locally in the Windows application data folder. Installing a newer version of GDSS Dutse Results keeps this folder and its database. Uninstalling the app is configured not to delete app data; keep independent backups as well.</p></section>
  </div>;
}

type SettingsSnapshot = {
  school: { schoolName: string; boardName: string; address: string; phone: string; logoPath: string | null };
  sessions: Array<{ id: string; name: string; isCurrent: number | boolean }>;
  terms: Array<{ id: string; sessionId: string; sessionName: string; termNumber: number; name: string; startDate: string | null; endDate: string | null; nextTermBegins: string | null; isCurrent: number | boolean }>;
  grades: Array<{ id: string; grade: string; minScore: number; remark: string }>;
  traits: Array<{ id: string; name: string; group: 'skills' | 'behaviour'; sortOrder: number }>;
  classes: Array<{ id: string; name: string; level: 'SS1'|'SS2'|'SS3'; stream: string | null; activeCount: number }>;
};
type GradeDraft = { id?: string; grade: string; minScore: number; remark: string };
type TraitDraft = { id?: string; name: string; group: 'skills' | 'behaviour'; sortOrder: number };
function SettingsPage({ showMessage }: { showMessage: (kind: 'success'|'error', text: string) => void }) {
  const [data, setData] = useState<SettingsSnapshot | null>(null);
  const [school, setSchool] = useState({ schoolName: '', boardName: '', address: '', phone: '' });
  const [sessionName, setSessionName] = useState('');
  const [grades, setGrades] = useState<GradeDraft[]>([]);
  const [traits, setTraits] = useState<TraitDraft[]>([]);
  const [sourceId, setSourceId] = useState(''); const [targetId, setTargetId] = useState('');
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    const snapshot = await window.desktop.settingsGet() as SettingsSnapshot;
    setData(snapshot); setSchool({ schoolName: snapshot.school?.schoolName ?? '', boardName: snapshot.school?.boardName ?? '', address: snapshot.school?.address ?? '', phone: snapshot.school?.phone ?? '' });
    setGrades(snapshot.grades.map((g) => ({ ...g }))); setTraits(snapshot.traits.map((t) => ({ ...t })));
    setSourceId((old) => old || snapshot.classes[0]?.id || '');
    setTargetId((old) => old || snapshot.classes[1]?.id || ''); setLoading(false);
  };
  useEffect(() => { void refresh().catch((error) => { showMessage('error', error instanceof Error ? error.message : 'Could not load settings.'); setLoading(false); }); }, []);
  const run = async (action: () => Promise<unknown>, success: string) => { try { await action(); await refresh(); showMessage('success', success); } catch (error) { showMessage('error', error instanceof Error ? error.message : 'Could not save settings.'); } };
  if (loading || !data) return <div className="placeholder-page"><h1>Settings</h1><div className="panel settings-panel">Loading saved settings…</div></div>;
  const updateGrade = (index: number, patch: Partial<GradeDraft>) => setGrades((old) => old.map((r, i) => i === index ? { ...r, ...patch } : r));
  const updateTrait = (index: number, patch: Partial<TraitDraft>) => setTraits((old) => old.map((r, i) => i === index ? { ...r, ...patch } : r));
  const moveTrait = (index: number, direction: -1 | 1) => setTraits((old) => { const next = [...old]; const swap = index + direction; if (swap < 0 || swap >= next.length || next[swap].group !== next[index].group) return old; [next[index], next[swap]] = [next[swap], next[index]]; return next.map((t, i) => ({ ...t, sortOrder: i })); });
  const source = data.classes.find((c) => c.id === sourceId);
  const targetOptions = data.classes.filter((c) => c.id !== sourceId && ((source?.level === 'SS1' && c.level === 'SS2') || (source?.level === 'SS2' && c.level === 'SS3')));
  const logoUrl = data.school?.logoPath ? `file:///${data.school.logoPath.replace(/\\/g, '/')}` : '';
  return <div className="settings-page">
    <div className="page-heading"><div><p className="eyebrow">PREFERENCES & SCHOOL RECORDS</p><h1>Settings</h1><p className="muted">Manage school identity, academic periods, grading and report-card traits.</p></div></div>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>School details</h2><p className="muted">These details identify the school on reports.</p></div></div>
      <div className="settings-school-grid"><div className="settings-logo-box">{logoUrl ? <img src={logoUrl} alt="School logo preview" /> : <div className="settings-logo-placeholder">GDSS<br/>LOGO</div>}<button className="button secondary" onClick={() => void run(() => window.desktop.settingsChooseLogo(), 'School logo saved on this computer.')}>Choose logo</button><small>PNG or JPG · Maximum 5 MB</small></div>
      <div className="settings-fields"><Field label="School name *"><input value={school.schoolName} onChange={(e) => setSchool({ ...school, schoolName: e.target.value })}/></Field><Field label="Board name"><input value={school.boardName} onChange={(e) => setSchool({ ...school, boardName: e.target.value })} placeholder="e.g. State Ministry of Education"/></Field><Field label="School address"><input value={school.address} onChange={(e) => setSchool({ ...school, address: e.target.value })}/></Field><Field label="Phone number"><input value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })}/></Field><button className="button primary" onClick={() => void run(() => window.desktop.settingsSaveSchool(school), 'School details saved.')}>Save school details</button></div></div>
    </section>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Academic sessions & terms</h2><p className="muted">Each new session automatically creates First, Second and Third Term.</p></div></div>
      <div className="session-create"><Field label="New academic session"><input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="2026/2027"/></Field><button className="button primary" onClick={() => void run(async () => { await window.desktop.settingsCreateSession(sessionName); setSessionName(''); }, 'Academic session and its three terms created.')}>Create session</button></div>
      {data.sessions.length === 0 && <p className="empty-note">No academic sessions saved yet.</p>}
      {data.terms.map((term) => <div className="term-row" key={term.id}><div className="term-label"><strong>{term.sessionName}</strong><span>{term.name}</span></div><label className="current-term-check"><input type="radio" name="currentTerm" checked={Boolean(term.isCurrent)} onChange={() => void run(() => window.desktop.settingsSetCurrentTerm(term.id), `${term.sessionName} · ${term.name} is now current.`)}/> Current term</label><div className="term-dates"><label>Start date<input type="date" value={term.startDate ?? ''} onChange={(e) => void run(() => window.desktop.settingsSaveTerm({ id: term.id, startDate: e.target.value || null, endDate: term.endDate, nextTermBegins: term.nextTermBegins }), 'Term date saved.')}/></label><label>End date<input type="date" value={term.endDate ?? ''} onChange={(e) => void run(() => window.desktop.settingsSaveTerm({ id: term.id, startDate: term.startDate, endDate: e.target.value || null, nextTermBegins: term.nextTermBegins }), 'Term date saved.')}/></label><label>Next term begins<input type="date" value={term.nextTermBegins ?? ''} onChange={(e) => void run(() => window.desktop.settingsSaveTerm({ id: term.id, startDate: term.startDate, endDate: term.endDate, nextTermBegins: e.target.value || null }), 'Term date saved.')}/></label></div></div>)}
      <p className="settings-footnote">Dates save when changed. Exactly one term is marked current after you select a current term; the first term of the first session is selected automatically.</p>
    </section>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Grading scale</h2><p className="muted">Minimum scores must be unique, within 0–100, and include a row starting at 0.</p></div><button className="button secondary" onClick={() => setGrades((old) => [...old, { grade: '', minScore: 0, remark: '' }])}>＋ Add grade</button></div>
      <div className="grade-table"><div className="grade-table-head"><span>Grade label</span><span>Minimum score</span><span>Remark</span><span></span></div>{grades.map((g, i) => <div className="grade-table-row" key={g.id ?? `new-${i}`}><input aria-label={`Grade label ${i+1}`} value={g.grade} onChange={(e) => updateGrade(i,{grade:e.target.value})}/><input aria-label={`Minimum score ${i+1}`} type="number" min="0" max="100" value={g.minScore} onChange={(e) => updateGrade(i,{minScore:e.target.value === '' ? Number.NaN : Number(e.target.value)})}/><input aria-label={`Grade remark ${i+1}`} value={g.remark} onChange={(e) => updateGrade(i,{remark:e.target.value})}/><button className="icon-button danger-text" aria-label="Remove grade" onClick={() => setGrades((old) => old.filter((_,j) => j !== i))}>×</button></div>)}</div>
      <div className="settings-actions"><button className="button primary" onClick={() => void run(() => window.desktop.settingsSaveGrades(grades), 'Grading scale saved.')}>Save grading scale</button></div>
    </section>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Skills & behaviour traits</h2><p className="muted">Manage the traits shown on student report cards. Use arrows to change their order.</p></div></div>
      {(['skills','behaviour'] as const).map((group) => <div className="trait-group" key={group}><h3>{group === 'skills' ? 'Skills' : 'Behaviour'}</h3>{traits.filter((t) => t.group === group).map((trait) => { const index = traits.indexOf(trait); return <div className="trait-row" key={trait.id ?? `${group}-${index}`}><input aria-label={`${group} trait name`} value={trait.name} onChange={(e) => updateTrait(index,{name:e.target.value})}/><button className="icon-button" aria-label="Move trait up" disabled={!traits[index-1] || traits[index-1].group !== group} onClick={() => moveTrait(index,-1)}>↑</button><button className="icon-button" aria-label="Move trait down" disabled={!traits[index+1] || traits[index+1].group !== group} onClick={() => moveTrait(index,1)}>↓</button><button className="icon-button danger-text" aria-label="Delete trait" onClick={() => setTraits((old) => old.filter((_,j) => j !== index))}>×</button></div>})}<button className="text-button add-trait" onClick={() => setTraits((old) => [...old,{ name:'',group,sortOrder:old.length }])}>＋ Add {group === 'skills' ? 'skill' : 'behaviour'} trait</button></div>)}
      <div className="settings-actions"><button className="button primary" onClick={() => void run(() => window.desktop.settingsSaveTraits(traits.map((t,i) => ({...t,sortOrder:i}))), 'Report-card traits saved.')}>Save traits</button></div>
    </section>
    <section className="panel settings-panel"><div className="settings-section-title"><div><h2>Student promotion</h2><p className="muted">Promote active students one level up and keep their existing scores and results.</p></div></div>
      <div className="promotion-grid"><Field label="Source class"><select value={sourceId} onChange={(e) => {setSourceId(e.target.value);setTargetId('');setActiveCount(null);}}><option value="">Choose source class</option>{data.classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}</select></Field><Field label="Target class (next level only)"><select value={targetId} onChange={(e) => {setTargetId(e.target.value);setActiveCount(null);}}><option value="">Choose target class</option>{targetOptions.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.level})</option>)}</select></Field><button className="button secondary" disabled={!sourceId} onClick={async () => { try { const count = await window.desktop.settingsGet() as SettingsSnapshot; const sourceClass = count.classes.find((c) => c.id === sourceId); if (!sourceClass) return; setActiveCount(sourceClass.activeCount); } catch (e) { showMessage('error',e instanceof Error ? e.message : 'Could not count students.'); } }}>Check active students</button></div>
      {activeCount !== null && <p className="info-panel">{activeCount} active students will move to {data.classes.find((c) => c.id === targetId)?.name}. Their previous results will be kept.</p>}
      <div className="settings-actions"><button className="button primary" disabled={!sourceId || !targetId || activeCount === null} onClick={() => { const from = data.classes.find((c) => c.id === sourceId); const to = data.classes.find((c) => c.id === targetId); if (!from || !to) return; if (window.confirm(`Promote ${activeCount} active students from ${from.name} to ${to.name}? Their previous scores and results will be kept.`)) void run(async () => { const result = await window.desktop.settingsPromote(sourceId,targetId); const moved = result as {count:number;source:string;target:string}; showMessage('success',`${moved.count} active students promoted from ${moved.source} to ${moved.target}. Previous results were kept.`); }, 'Promotion complete.'); }}>Confirm promotion</button></div>
      <p className="settings-footnote">Promotion moves only active students, requires SS1 → SS2 or SS2 → SS3, and does not delete their score or report history. SS3 has no higher class in this school model.</p>
    </section>
  </div>;
}
