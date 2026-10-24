import { app, BrowserWindow, ipcMain, session, dialog, utilityProcess, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { validateGradingScale, validateLogo, validateSchoolName, validateSessionName, validateTermDates, validateTraits, validatePromotion } from '../src/core/settingsValidation';
import Database from 'better-sqlite3';
import { migrateDatabase } from '../src/db/database';
import { createDailyBackup, createManualBackup, restoreDatabase } from '../src/db/backup';
import { getSubjectsToCopy, hasDuplicateSubjectName } from '../src/core/subjectLogic';
import { parseStudentCsv, parseStudentXlsx, validateStudentImportRows, createStudentTemplate, type ImportedStudentRow } from '../src/io/studentImport';
import { parseScoreCsv, parseScoreXlsx, createScoreTemplate, normalizeScoreKey, saveImportedScores, type ParsedScoreSheet } from '../src/io/scoreImport';
import type { ReportCardData, ReportCardOptions } from '../src/pdf/reportCard';

const gotLock = app.requestSingleInstanceLock();
let databasePath = '';
let activeReportWorker: ReturnType<typeof utilityProcess.fork> | null = null;
function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(databasePath);
  try { db.pragma('foreign_keys = ON'); return fn(db); } finally { db.close(); }
}
function settingsSnapshot() { return withDb((db) => ({
  school: db.prepare('SELECT id,school_name AS schoolName,board_name AS boardName,address,phone,logo_path AS logoPath FROM school_settings LIMIT 1').get(),
  sessions: db.prepare('SELECT id,name,is_current AS isCurrent FROM academic_sessions ORDER BY name DESC').all(),
  terms: db.prepare('SELECT t.id,t.session_id AS sessionId,s.name AS sessionName,t.term_number AS termNumber,t.name,t.start_date AS startDate,t.end_date AS endDate,t.next_term_begins AS nextTermBegins,t.is_current AS isCurrent FROM terms t JOIN academic_sessions s ON s.id=t.session_id ORDER BY s.name DESC,t.term_number').all(),
  grades: db.prepare('SELECT id,grade,min_score AS minScore,remark FROM grading_scale ORDER BY min_score DESC').all(),
  traits: db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all(),
  classes: db.prepare('SELECT c.id,c.name,c.level,c.stream,(SELECT COUNT(*) FROM students st WHERE st.class_id=c.id AND st.is_active=1) AS activeCount FROM classes c ORDER BY c.sort_order,c.name').all()
})); }

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0];
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');

  function createWindow() {
    const win = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 900,
      minHeight: 650,
      show: false,
      title: 'GDSS Dutse Results',
      backgroundColor: '#f6f7f9',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    });

    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      });
    });

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      const allowed = app.isPackaged ? url.startsWith('file://') : url.startsWith('http://127.0.0.1:5173/');
      if (!allowed) event.preventDefault();
    });

    if (app.isPackaged) {
      void win.loadFile(path.join(__dirname, '../../dist/index.html'));
    } else {
      void win.loadURL('http://127.0.0.1:5173/');
    }
    win.once('ready-to-show', () => win.show());
  }

  app.whenReady().then(() => {
    const dataDirectory = app.getPath('userData');
    fs.mkdirSync(dataDirectory, { recursive: true });
    databasePath = path.join(dataDirectory, 'gdss-dutse-results.db');
    const startupDb = new Database(databasePath);
    try {
      migrateDatabase(startupDb);
    } finally {
      startupDb.close();
    }
    createDailyBackup({ databasePath, backupDirectory: path.join(dataDirectory, 'Backups'), keep: 14 });

    // Deny all outgoing network requests. The development Vite page is loaded locally.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const localDev = !app.isPackaged && details.url.startsWith('http://127.0.0.1:5173/');
      const localFile = details.url.startsWith('file://') || details.url.startsWith('devtools://');
      callback({ cancel: !(localDev || localFile) });
    });

    ipcMain.handle('setup:complete', (_event, input: { schoolName: string; address?: string; phone?: string; sessionName: string; termNumber: number; classes: Array<{name:string;level:'SS1'|'SS2'|'SS3';stream?:string}> }) => {
      const invalidSchool = validateSchoolName(input.schoolName); if (invalidSchool) throw new Error(invalidSchool);
      const invalidSession = validateSessionName(input.sessionName); if (invalidSession) throw new Error(invalidSession);
      if (![1,2,3].includes(Number(input.termNumber))) throw new Error('Choose a valid current term.');
      const classes = (input.classes || []).map((c) => ({name:String(c.name || '').trim(),level:c.level,stream:String(c.stream || '').trim() || null})).filter((c) => c.name);
      for (const c of classes) if (!['SS1','SS2','SS3'].includes(c.level)) throw new Error('Every class must use SS1, SS2 or SS3.');
      const names = new Set<string>(); for (const c of classes) { const key = c.name.toLocaleLowerCase(); if (names.has(key)) throw new Error(`Class ${c.name} is listed more than once.`); names.add(key); }
      return withDb((db) => db.transaction(() => {
        db.prepare('UPDATE school_settings SET school_name=?,address=?,phone=? WHERE id=(SELECT id FROM school_settings LIMIT 1)').run(input.schoolName.trim(),String(input.address || '').trim(),String(input.phone || '').trim());
        let session = db.prepare('SELECT id FROM academic_sessions WHERE name=?').get(input.sessionName.trim()) as {id:string}|undefined;
        if (!session) {
          const sessionId = randomUUID(); db.prepare('INSERT INTO academic_sessions(id,name,is_current) VALUES(?,?,0)').run(sessionId,input.sessionName.trim());
          const insertTerm = db.prepare('INSERT INTO terms(id,session_id,term_number,name,is_current) VALUES(?,?,?,?,0)');
          ['First Term','Second Term','Third Term'].forEach((term,index)=>insertTerm.run(randomUUID(),sessionId,index+1,term)); session = {id:sessionId};
        }
        db.prepare('UPDATE terms SET is_current=0').run(); db.prepare('UPDATE academic_sessions SET is_current=0').run();
        db.prepare('UPDATE terms SET is_current=1 WHERE session_id=? AND term_number=?').run(session.id,Number(input.termNumber));
        db.prepare('UPDATE academic_sessions SET is_current=1 WHERE id=?').run(session.id);
        const insertClass = db.prepare('INSERT OR IGNORE INTO classes(id,name,level,stream,sort_order) VALUES(?,?,?,?,?)');
        classes.forEach((c,index)=>insertClass.run(randomUUID(),c.name,c.level,c.stream,({SS1:100,SS2:200,SS3:300} as Record<string,number>)[c.level]+index));
        return { ok:true };
      })());
    });
    ipcMain.handle('dashboard:get', () => withDb((db) => {
      const classes = db.prepare(`SELECT c.id,c.name,c.level,c.stream,
        (SELECT COUNT(*) FROM students st WHERE st.class_id=c.id AND st.is_active=1) AS activeStudents,
        (SELECT COUNT(*) FROM subjects su WHERE su.class_id=c.id) AS subjectCount,
        (SELECT COUNT(*) FROM scores sc JOIN students st ON st.id=sc.student_id JOIN subjects su ON su.id=sc.subject_id WHERE st.class_id=c.id AND st.is_active=1 AND sc.term_id=(SELECT id FROM terms WHERE is_current=1 LIMIT 1) AND sc.ca IS NOT NULL AND sc.exam IS NOT NULL) AS completeScores
        FROM classes c ORDER BY CASE c.level WHEN 'SS1' THEN 1 WHEN 'SS2' THEN 2 ELSE 3 END,c.name`).all() as Array<{id:string;name:string;level:string;stream:string|null;activeStudents:number;subjectCount:number;completeScores:number}>;
      const totalStudents = (db.prepare('SELECT COUNT(*) AS count FROM students WHERE is_active=1').get() as {count:number}).count;
      const totalSubjects = (db.prepare('SELECT COUNT(*) AS count FROM subjects').get() as {count:number}).count;
      const currentTerm = db.prepare('SELECT id,name FROM terms WHERE is_current=1 LIMIT 1').get() as {id:string;name:string}|undefined;
      const progress = classes.map((c) => { const possible = c.activeStudents*c.subjectCount; const percent = possible ? Math.round(c.completeScores/possible*100) : 0; return {...c,percent,progressLabel: possible ? `${percent}%` : 'No students or subjects'}; });
      return {totalStudents,totalSubjects,totalClasses:classes.length,currentTerm,classes:progress};
    }));
    ipcMain.handle('backup:create', async () => {
      const defaultPath = path.join(app.getPath('documents'),'GDSS Reports','GDSS-Dutse-Backup.db'); fs.mkdirSync(path.dirname(defaultPath),{recursive:true});
      const picked = await dialog.showSaveDialog({title:'Save GDSS Dutse data backup',defaultPath,filters:[{name:'SQLite backup',extensions:['db']} ]});
      if (picked.canceled || !picked.filePath) return {cancelled:true};
      const target = picked.filePath.toLowerCase().endsWith('.db') ? picked.filePath : `${picked.filePath}.db`;
      createManualBackup(databasePath,target); return {cancelled:false,path:target};
    });
    ipcMain.handle('backup:restore', async () => {
      const picked = await dialog.showOpenDialog({title:'Choose GDSS Dutse backup to restore',properties:['openFile'],filters:[{name:'SQLite backup',extensions:['db']} ]});
      if (picked.canceled || !picked.filePaths[0]) return {cancelled:true};
      const source = picked.filePaths[0];
      const confirm = await dialog.showMessageBox({type:'warning',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0,noLink:true,title:'Replace current school data?',message:'Restoring replaces the data currently on this computer.',detail:'A safety backup of the current database will be created automatically before restoring. Close other copies of the app first.'});
      if (confirm.response !== 1) return {cancelled:true};
      const safety = path.join(app.getPath('userData'),'Backups',`before-restore-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);
      restoreDatabase(source,databasePath,safety,true); return {cancelled:false,safetyCopy:safety,restartRequired:true};
    });
    ipcMain.handle('settings:get', () => settingsSnapshot());
    ipcMain.handle('settings:save-school', (_event, input: { schoolName: string; boardName: string; address: string; phone: string }) => {
      const invalid = validateSchoolName(input.schoolName); if (invalid) throw new Error(invalid);
      withDb((db) => db.prepare('UPDATE school_settings SET school_name=?,board_name=?,address=?,phone=? WHERE id=(SELECT id FROM school_settings LIMIT 1)').run(input.schoolName.trim(), input.boardName.trim(), input.address.trim(), input.phone.trim()));
      return settingsSnapshot();
    });
    ipcMain.handle('settings:choose-logo', async () => {
      const picked = await dialog.showOpenDialog({ title: 'Choose school logo', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png','jpg','jpeg'] }] });
      if (picked.canceled || !picked.filePaths[0]) return settingsSnapshot();
      const source = picked.filePaths[0]; const stat = fs.statSync(source); const invalid = validateLogo(source, stat.size); if (invalid) throw new Error(invalid);
      const logoDirectory = path.join(app.getPath('userData'), 'school-assets'); fs.mkdirSync(logoDirectory, { recursive: true });
      const extension = path.extname(source).toLowerCase() === '.jpeg' ? '.jpg' : path.extname(source).toLowerCase();
      const target = path.join(logoDirectory, `school-logo${extension}`); fs.copyFileSync(source, target);
      withDb((db) => db.prepare('UPDATE school_settings SET logo_path=? WHERE id=(SELECT id FROM school_settings LIMIT 1)').run(target)); return settingsSnapshot();
    });
    ipcMain.handle('settings:create-session', (_event, name: string) => {
      const invalid = validateSessionName(name); if (invalid) throw new Error(invalid);
      withDb((db) => db.transaction(() => {
        const clean = name.trim(); if (db.prepare('SELECT 1 FROM academic_sessions WHERE name=?').get(clean)) throw new Error('That academic session already exists.');
        const id = randomUUID(); const hasCurrent = Boolean(db.prepare('SELECT 1 FROM terms WHERE is_current=1').get());
        db.prepare('INSERT INTO academic_sessions(id,name,is_current) VALUES(?,?,?)').run(id, clean, hasCurrent ? 0 : 1);
        const insert = db.prepare('INSERT INTO terms(id,session_id,term_number,name,is_current) VALUES(?,?,?,?,?)');
        ['First Term','Second Term','Third Term'].forEach((term, index) => insert.run(randomUUID(), id, index + 1, term, !hasCurrent && index === 0 ? 1 : 0));
      })()); return settingsSnapshot();
    });
    ipcMain.handle('settings:set-current-term', (_event, termId: string) => {
      withDb((db) => db.transaction(() => { if (!db.prepare('SELECT 1 FROM terms WHERE id=?').get(termId)) throw new Error('Term not found.'); db.prepare('UPDATE terms SET is_current=0').run(); db.prepare('UPDATE terms SET is_current=1 WHERE id=?').run(termId); db.prepare('UPDATE academic_sessions SET is_current=0').run(); db.prepare('UPDATE academic_sessions SET is_current=1 WHERE id=(SELECT session_id FROM terms WHERE id=?)').run(termId); })()); return settingsSnapshot();
    });
    ipcMain.handle('settings:save-term', (_event, input: { id: string; startDate: string | null; endDate: string | null; nextTermBegins: string | null }) => {
      const invalid = validateTermDates(input.startDate, input.endDate, input.nextTermBegins); if (invalid) throw new Error(invalid);
      withDb((db) => { const result = db.prepare('UPDATE terms SET start_date=?,end_date=?,next_term_begins=? WHERE id=?').run(input.startDate || null,input.endDate || null,input.nextTermBegins || null,input.id); if (!result.changes) throw new Error('Term not found.'); }); return settingsSnapshot();
    });
    ipcMain.handle('settings:save-grades', (_event, rows: Array<{ id?: string; grade: string; minScore: number; remark: string }>) => {
      const invalid = validateGradingScale(rows); if (invalid) throw new Error(invalid);
      withDb((db) => db.transaction(() => { db.prepare('DELETE FROM grading_scale').run(); const insert = db.prepare('INSERT INTO grading_scale(id,grade,min_score,remark,is_placeholder) VALUES(?,?,?,?,0)'); rows.forEach((r) => insert.run(randomUUID(),r.grade.trim().toUpperCase(),Number(r.minScore),r.remark.trim())); })()); return settingsSnapshot();
    });
    ipcMain.handle('settings:save-traits', (_event, rows: Array<{ id?: string; name: string; group: 'skills'|'behaviour'; sortOrder: number }>) => {
      const invalid = validateTraits(rows); if (invalid) throw new Error(invalid);
      withDb((db) => db.transaction(() => {
        const old = db.prepare('SELECT id FROM rating_traits').all() as Array<{id:string}>; const keep = new Set(rows.map((r) => r.id).filter(Boolean));
        for (const item of old) if (!keep.has(item.id)) { const hasRatings = db.prepare('SELECT 1 FROM student_ratings WHERE trait_id=? LIMIT 1').get(item.id); if (hasRatings) throw new Error('A trait already used in student ratings cannot be deleted.'); db.prepare('DELETE FROM rating_traits WHERE id=?').run(item.id); }
        rows.forEach((r, index) => { if (r.id && db.prepare('SELECT 1 FROM rating_traits WHERE id=?').get(r.id)) db.prepare('UPDATE rating_traits SET name=?,trait_group=?,sort_order=? WHERE id=?').run(r.name.trim(),r.group,index,r.id); else db.prepare('INSERT INTO rating_traits(id,name,trait_group,sort_order) VALUES(?,?,?,?)').run(randomUUID(),r.name.trim(),r.group,index); });
      })()); return settingsSnapshot();
    });
    ipcMain.handle('settings:promote', (_event, input: { sourceClassId: string; targetClassId: string }) => withDb((db) => db.transaction(() => {
      if (input.sourceClassId === input.targetClassId) throw new Error('Choose a different target class.');
      const source = db.prepare('SELECT id,name,level FROM classes WHERE id=?').get(input.sourceClassId) as {id:string;name:string;level:string}|undefined;
      const target = db.prepare('SELECT id,name,level FROM classes WHERE id=?').get(input.targetClassId) as {id:string;name:string;level:string}|undefined;
      if (!source || !target) throw new Error('Choose valid source and target classes.');
      const invalid = validatePromotion(source.level, target.level); if (invalid) throw new Error(invalid);
      const count = (db.prepare('SELECT COUNT(*) AS count FROM students WHERE class_id=? AND is_active=1').get(source.id) as {count:number}).count;
      db.prepare('UPDATE students SET class_id=? WHERE class_id=? AND is_active=1').run(target.id,source.id); return { count, source: source.name, target: target.name };
    })()));
    ipcMain.handle('classes:get', () => withDb((db) => ({
      classes: db.prepare(`SELECT c.id,c.name,c.level,c.stream,c.class_master_name AS classMasterName,c.sort_order AS sortOrder,
        (SELECT COUNT(*) FROM students st WHERE st.class_id=c.id) AS studentCount,
        (SELECT COUNT(*) FROM subjects su WHERE su.class_id=c.id) AS subjectCount
        FROM classes c ORDER BY CASE c.level WHEN 'SS1' THEN 1 WHEN 'SS2' THEN 2 ELSE 3 END,c.stream,c.name`).all(),
      students: db.prepare('SELECT id,class_id AS classId,full_name AS fullName,admission_no AS admissionNo,gender,is_active AS isActive FROM students ORDER BY full_name COLLATE NOCASE').all(),
      subjects: db.prepare('SELECT id,class_id AS classId,name,sort_order AS sortOrder FROM subjects ORDER BY sort_order,name').all()
    })));
    ipcMain.handle('classes:add-stream', (_event, level: string) => withDb((db) => {
      if (!['SS1','SS2','SS3'].includes(level)) throw new Error('Choose SS1, SS2 or SS3.');
      const existing = new Set((db.prepare('SELECT stream FROM classes WHERE level=?').all(level) as Array<{stream:string|null}>).map((r) => r.stream));
      const stream = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find((letter) => !existing.has(letter));
      if (!stream) throw new Error(`All A–Z streams already exist for ${level}.`);
      const id = randomUUID(); const name = `${level} ${stream}`;
      db.prepare('INSERT INTO classes(id,name,level,stream,sort_order) VALUES(?,?,?,?,?)').run(id,name,level,stream,({SS1:100,SS2:200,SS3:300} as Record<string,number>)[level] + stream.charCodeAt(0));
      return { id,name,level,stream,classMasterName:null,sortOrder:0,studentCount:0,subjectCount:0 };
    }));
    ipcMain.handle('classes:delete', (_event, classId: string) => withDb((db) => {
      const count = (db.prepare('SELECT COUNT(*) AS count FROM students WHERE class_id=?').get(classId) as {count:number}).count;
      if (count > 0) throw new Error('This class cannot be deleted while it has students.');
      const result = db.prepare('DELETE FROM classes WHERE id=?').run(classId);
      if (!result.changes) throw new Error('Class not found.');
      return true;
    }));
    ipcMain.handle('classes:save-master', (_event, input: {classId:string;name:string}) => withDb((db) => {
      const result = db.prepare('UPDATE classes SET class_master_name=? WHERE id=?').run(input.name.trim() || null,input.classId);
      if (!result.changes) throw new Error('Class not found.'); return true;
    }));
    ipcMain.handle('subjects:add', (_event, input: {classId:string;name:string}) => withDb((db) => {
      const name = input.name.trim(); if (!name) throw new Error('Enter a subject name.');
      const existingNames=(db.prepare('SELECT name FROM subjects WHERE class_id=?').all(input.classId) as Array<{name:string}>).map((r)=>r.name);
      if (hasDuplicateSubjectName(existingNames,name)) throw new Error(`${name} already exists in this class.`);
      const id = randomUUID(); const order = (db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM subjects WHERE class_id=?').get(input.classId) as {next:number}).next;
      db.prepare('INSERT INTO subjects(id,class_id,name,sort_order) VALUES(?,?,?,?)').run(id,input.classId,name,order); return {id,classId:input.classId,name,sortOrder:order};
    }));
    ipcMain.handle('subjects:rename', (_event, input: {subjectId:string;classId:string;name:string}) => withDb((db) => {
      const name=input.name.trim(); if(!name) throw new Error('Enter a subject name.');
      const existingNames=(db.prepare('SELECT name FROM subjects WHERE class_id=? AND id<>?').all(input.classId,input.subjectId) as Array<{name:string}>).map((r)=>r.name);
      if(hasDuplicateSubjectName(existingNames,name)) throw new Error('A subject with this name already exists in this class.');
      const result=db.prepare('UPDATE subjects SET name=? WHERE id=? AND class_id=?').run(name,input.subjectId,input.classId); if(!result.changes) throw new Error('Subject not found.'); return true;
    }));
    ipcMain.handle('subjects:delete', (_event, subjectId:string) => withDb((db) => { const result=db.prepare('DELETE FROM subjects WHERE id=?').run(subjectId); if(!result.changes) throw new Error('Subject not found.'); return true; }));
    ipcMain.handle('subjects:move', (_event, input:{classId:string;subjectId:string;direction:-1|1}) => withDb((db) => db.transaction(() => {
      if(input.direction!==-1 && input.direction!==1) throw new Error('Invalid subject order direction.');
      const rows=db.prepare('SELECT id,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId) as Array<{id:string;sortOrder:number}>;
      const index=rows.findIndex((r)=>r.id===input.subjectId), other=index+input.direction; if(index<0 || other<0 || other>=rows.length) return false;
      // Temporary values avoid UNIQUE or ordering collisions in future schema changes.
      db.prepare('UPDATE subjects SET sort_order=-sort_order-100000 WHERE id IN (?,?)').run(rows[index].id,rows[other].id);
      db.prepare('UPDATE subjects SET sort_order=? WHERE id=?').run(rows[other].sortOrder,rows[index].id);
      db.prepare('UPDATE subjects SET sort_order=? WHERE id=?').run(rows[index].sortOrder,rows[other].id); return true;
    })()));
    ipcMain.handle('subjects:copy', (_event, input:{sourceClassId:string;targetClassIds:string[]}) => withDb((db) => db.transaction(() => {
      const source=db.prepare('SELECT id FROM classes WHERE id=?').get(input.sourceClassId); if(!source) throw new Error('Choose a valid source class.');
      const targets=[...new Set(input.targetClassIds)].filter((id)=>id!==input.sourceClassId);
      const sourceSubjects=db.prepare('SELECT name FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.sourceClassId) as Array<{name:string}>;
      let added=0;
      for(const targetId of targets){ if(!db.prepare('SELECT 1 FROM classes WHERE id=?').get(targetId)) continue;
        const targetNames=(db.prepare('SELECT name FROM subjects WHERE class_id=?').all(targetId) as Array<{name:string}>).map((r)=>r.name);
        for(const subjectName of getSubjectsToCopy(sourceSubjects.map((r)=>r.name),targetNames)){
          const id=randomUUID(); const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM subjects WHERE class_id=?').get(targetId) as {next:number}).next;
          db.prepare('INSERT INTO subjects(id,class_id,name,sort_order) VALUES(?,?,?,?)').run(id,targetId,subjectName,order); added++; targetNames.push(subjectName);
        }
      } return added;
    })()));
    ipcMain.handle('students:list', () => withDb((db) => ({
      classes: db.prepare('SELECT id,name,level,stream FROM classes ORDER BY CASE level WHEN \'SS1\' THEN 1 WHEN \'SS2\' THEN 2 ELSE 3 END,name').all(),
      students: db.prepare('SELECT id,class_id AS classId,full_name AS fullName,admission_no AS admissionNo,gender,is_active AS isActive FROM students ORDER BY full_name COLLATE NOCASE').all()
    })));
    ipcMain.handle('students:save', (_event, input: {id?:string;classId:string;fullName:string;admissionNo:string;gender:'M'|'F';isActive?:boolean}) => withDb((db) => {
      const fullName = String(input.fullName ?? '').trim(); const admissionNo = String(input.admissionNo ?? '').trim() || null;
      if (!fullName) throw new Error('Enter the student name.');
      if (input.gender !== 'M' && input.gender !== 'F') throw new Error('Gender must be M or F.');
      if (!db.prepare('SELECT 1 FROM classes WHERE id=?').get(input.classId)) throw new Error('Choose a valid class.');
      if (admissionNo && db.prepare('SELECT 1 FROM students WHERE lower(admission_no)=lower(?) AND id<>?').get(admissionNo,input.id ?? '') ) throw new Error('That admission number is already used.');
      try {
        if (input.id) {
          const result = db.prepare('UPDATE students SET class_id=?,full_name=?,admission_no=?,gender=?,is_active=? WHERE id=?').run(input.classId,fullName,admissionNo,input.gender,input.isActive === false ? 0 : 1,input.id);
          if (!result.changes) throw new Error('Student not found.');
          return { id:input.id,classId:input.classId,fullName,admissionNo,gender:input.gender,isActive:input.isActive !== false };
        }
        const id=randomUUID(); db.prepare('INSERT INTO students(id,class_id,full_name,admission_no,gender,is_active) VALUES(?,?,?,?,?,?)').run(id,input.classId,fullName,admissionNo,input.gender,input.isActive === false ? 0 : 1);
        return { id,classId:input.classId,fullName,admissionNo,gender:input.gender,isActive:input.isActive !== false };
      } catch (error) { if (error instanceof Error && /UNIQUE constraint failed: students.admission_no/i.test(error.message)) throw new Error('That admission number is already used.'); throw error; }
    }));
    ipcMain.handle('students:delete', (_event, studentId:string) => withDb((db) => {
      const result=db.prepare('DELETE FROM students WHERE id=?').run(studentId); if(!result.changes) throw new Error('Student not found.'); return true;
    }));
    ipcMain.handle('students:choose-import', async (_event, targetClassId:string) => {
      const picked=await dialog.showOpenDialog({title:'Import students',properties:['openFile'],filters:[{name:'Student files',extensions:['xlsx','csv','xls']}]});
      if(picked.canceled || !picked.filePaths[0]) return null;
      const file=picked.filePaths[0], ext=path.extname(file).toLowerCase();
      if(ext==='.xls') throw new Error('Old .xls files are not supported. Please save the file as .xlsx or CSV and try again.');
      let rows:ImportedStudentRow[];
      if(ext==='.csv') rows=parseStudentCsv(fs.readFileSync(file,'utf8')).rows;
      else if(ext==='.xlsx') rows=await parseStudentXlsx(fs.readFileSync(file));
      else throw new Error('Choose an .xlsx or .csv file.');
      const existing=withDb((db)=>db.prepare('SELECT full_name AS fullName,admission_no AS admissionNo,class_id AS classId FROM students').all()) as Array<{fullName:string;admissionNo:string|null;classId:string}>;
      const preview=validateStudentImportRows(rows,existing,targetClassId);
      return { rows:preview, targetClassId };
    });
    ipcMain.handle('students:import-valid', (_event, input:{classId:string;rows:Array<{fullName:string;gender:'M'|'F';admissionNo:string}>}) => withDb((db)=>db.transaction(()=>{
      if(!db.prepare('SELECT 1 FROM classes WHERE id=?').get(input.classId)) throw new Error('Choose a valid class.');
      let imported=0, skipped=0;
      const insert=db.prepare('INSERT INTO students(id,class_id,full_name,admission_no,gender,is_active) VALUES(?,?,?,?,?,1)');
      for(const row of input.rows){
        const name=String(row.fullName??'').trim(), admission=String(row.admissionNo??'').trim()||null, gender=row.gender;
        if(!name || (gender!=='M' && gender!=='F') || (admission && db.prepare('SELECT 1 FROM students WHERE lower(admission_no)=lower(?)').get(admission)) || db.prepare('SELECT 1 FROM students WHERE class_id=? AND lower(full_name)=lower(?)').get(input.classId,name)){ skipped++; continue; }
        try { insert.run(randomUUID(),input.classId,name,admission,gender); imported++; } catch { skipped++; }
      }
      return {imported,skipped};
    })()));
    ipcMain.handle('students:download-template', async (_event, format:'xlsx'|'csv') => {
      if(format!=='xlsx' && format!=='csv') throw new Error('Choose XLSX or CSV.');
      const ext=format==='xlsx'?'xlsx':'csv';
      const picked=await dialog.showSaveDialog({title:'Save student import template',defaultPath:`GDSS-Student-Template.${ext}`,filters:[{name:format==='xlsx'?'Excel Workbook':'CSV File',extensions:[ext]}]});
      if(picked.canceled || !picked.filePath) return false;
      fs.writeFileSync(picked.filePath,await createStudentTemplate(format)); return true;
    });

    ipcMain.handle('scores:get', (_event, input:{classId:string;termId:string}) => withDb((db) => {
      const classes=db.prepare('SELECT id,name,level FROM classes ORDER BY sort_order,name').all();
      const terms=db.prepare('SELECT t.id,t.session_id AS sessionId,s.name AS sessionName,t.name,t.term_number AS termNumber,t.is_current AS isCurrent FROM terms t JOIN academic_sessions s ON s.id=t.session_id ORDER BY s.name DESC,t.term_number').all();
      const students=db.prepare('SELECT id,class_id AS classId,full_name AS fullName,admission_no AS admissionNo,gender FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId);
      const subjects=db.prepare('SELECT id,class_id AS classId,name,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId);
      const scores=db.prepare('SELECT id,student_id AS studentId,subject_id AS subjectId,term_id AS termId,ca,exam FROM scores WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId);
      const grades=db.prepare('SELECT id,grade,min_score AS minScore,remark FROM grading_scale ORDER BY min_score DESC').all();
      const traits=db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all();
      const ratings=db.prepare('SELECT id,student_id AS studentId,term_id AS termId,trait_id AS traitId,rating FROM student_ratings WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId);
      const remarks=db.prepare('SELECT id,student_id AS studentId,term_id AS termId,class_master_remark AS classMasterRemark,director_remark AS directorRemark FROM term_remarks WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId);
      return {classes,terms,students,subjects,scores,grades,traits,ratings,remarks};
    }));
    ipcMain.handle('scores:save', (_event, input:{studentId:string;subjectId:string;termId:string;ca:number|null;exam:number|null}) => withDb((db) => {
      for (const [value,max,label] of [[input.ca,30,'CA'],[input.exam,70,'Exam']] as Array<[number|null,number,string]>) {
        if (value !== null && (!Number.isFinite(value) || value < 0 || value > max)) throw new Error(`${label} must be between 0 and ${max}.`);
        if (value !== null && Math.round(value*10)!==value*10) throw new Error(`${label} allows one decimal place.`);
      }
      if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(input.studentId)) throw new Error('Student not found.');
      if (!db.prepare('SELECT 1 FROM subjects WHERE id=?').get(input.subjectId)) throw new Error('Subject not found.');
      if (!db.prepare('SELECT 1 FROM terms WHERE id=?').get(input.termId)) throw new Error('Term not found.');
      db.prepare(`INSERT INTO scores(id,student_id,subject_id,term_id,ca,exam) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id,term_id) DO UPDATE SET ca=excluded.ca,exam=excluded.exam`).run(randomUUID(),input.studentId,input.subjectId,input.termId,input.ca,input.exam);
      return true;
    }));
    ipcMain.handle('scores:save-rating', (_event, input:{studentId:string;termId:string;traitId:string;rating:number}) => withDb((db) => {
      if (!Number.isInteger(input.rating) || input.rating<1 || input.rating>5) throw new Error('Rating must be from 1 to 5.');
      db.prepare(`INSERT INTO student_ratings(id,student_id,term_id,trait_id,rating) VALUES(?,?,?,?,?) ON CONFLICT(student_id,term_id,trait_id) DO UPDATE SET rating=excluded.rating`).run(randomUUID(),input.studentId,input.termId,input.traitId,input.rating); return true;
    }));
    ipcMain.handle('scores:save-remarks', (_event, input:{studentId:string;termId:string;classMasterRemark:string;directorRemark:string}) => withDb((db) => {
      db.prepare(`INSERT INTO term_remarks(id,student_id,term_id,class_master_remark,director_remark) VALUES(?,?,?,?,?) ON CONFLICT(student_id,term_id) DO UPDATE SET class_master_remark=excluded.class_master_remark,director_remark=excluded.director_remark`).run(randomUUID(),input.studentId,input.termId,input.classMasterRemark,input.directorRemark); return true;
    }));
    ipcMain.handle('scores:download-template', async (_event, input:{classId:string;termId:string;subjectId:string|null;format:'xlsx'|'csv'}) => {
      if(input.format!=='xlsx'&&input.format!=='csv') throw new Error('Choose XLSX or CSV.');
      const dataset=withDb((db)=>{
        const allSubjects=db.prepare('SELECT id,name FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId) as Array<{id:string;name:string}>;
        const subjects=input.subjectId?allSubjects.filter(s=>s.id===input.subjectId):allSubjects;
        if(!subjects.length) throw new Error('No subjects found for this class. Add subjects first.');
        const students=db.prepare('SELECT id,admission_no AS admissionNo,full_name AS fullName FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId) as Array<{id:string;admissionNo:string|null;fullName:string}>;
        const scoreRows=db.prepare('SELECT student_id AS studentId,subject_id AS subjectId,ca,exam FROM scores WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId) as Array<{studentId:string;subjectId:string;ca:number|null;exam:number|null}>;
        return {subjects,students:students.map(st=>({admissionNo:st.admissionNo,fullName:st.fullName,scores:Object.fromEntries(scoreRows.filter(r=>r.studentId===st.id).map(r=>[r.subjectId,{ca:r.ca,exam:r.exam}]))}))};
      });
      const bytes=await createScoreTemplate(input.format,dataset.subjects,dataset.students);
      const ext=input.format;const picked=await dialog.showSaveDialog({title:'Save score template',defaultPath:`GDSS-Score-Template.${ext}`,filters:[{name:ext==='xlsx'?'Excel Workbook':'CSV File',extensions:[ext]}]});
      if(picked.canceled||!picked.filePath)return false;fs.writeFileSync(picked.filePath,bytes);return true;
    });
    ipcMain.handle('scores:choose-import', async (_event,input:{classId:string;termId:string;selectedSubjectId:string|null;replaceExisting:boolean})=>{
      const picked=await dialog.showOpenDialog({title:'Import scores',properties:['openFile'],filters:[{name:'Score files',extensions:['xlsx','csv','xls']}]});
      if(picked.canceled||!picked.filePaths[0])return null;
      const file=picked.filePaths[0],ext=path.extname(file).toLowerCase();
      if(ext==='.xls')throw new Error('Old .xls files are not supported. Please save the file as .xlsx or CSV and try again.');
      let parsed:ParsedScoreSheet;
      if(ext==='.csv')parsed=parseScoreCsv(fs.readFileSync(file,'utf8'));else if(ext==='.xlsx')parsed=await parseScoreXlsx(fs.readFileSync(file));else throw new Error('Choose an .xlsx or .csv file.');
      return withDb((db)=>{
        const students=db.prepare('SELECT id,full_name AS fullName,admission_no AS admissionNo FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId) as Array<{id:string;fullName:string;admissionNo:string|null}>;
        const subjects=db.prepare('SELECT id,name FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId) as Array<{id:string;name:string}>;
        const scoreRows=db.prepare('SELECT student_id AS studentId,subject_id AS subjectId,ca,exam FROM scores WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId) as Array<{studentId:string;subjectId:string;ca:number|null;exam:number|null}>;
        const warnings:string[]=[];const subjectByKey=new Map(subjects.map(s=>[normalizeScoreKey(s.name),s]));
        const mapped=parsed.columns.flatMap(col=>{let subject=col.subjectKey?subjectByKey.get(col.subjectKey):subjects.find(s=>s.id===input.selectedSubjectId);if(!subject){warnings.push(col.subjectKey?`Unknown subject column “${col.header}” was skipped.`:`Plain ${col.field.toUpperCase()} column skipped because no subject is selected.`);return [];}return [{...col,subjectId:subject.id,subjectName:subject.name}];});
        if(!mapped.length)throw new Error('No score columns matched subjects in this class.');
        const normName=(s:string)=>normalizeScoreKey(s).replace(/[^\p{L}\p{N}]/gu,'');
        const entries:any[]=[];const matchedByRow=new Map<number,any>();const rowCounts=new Map<string,number>();
        for(const row of parsed.rows){let student:any=null;if(row.admissionNo)student=students.find(s=>s.admissionNo&&s.admissionNo.trim().toLocaleLowerCase()===row.admissionNo.trim().toLocaleLowerCase())??null;
          if(!student&&row.fullName){const hits=students.filter(s=>normName(s.fullName)===normName(row.fullName));if(hits.length===1)student=hits[0];else if(hits.length>1)student={ambiguous:true};}
          if(student?.id)rowCounts.set(student.id,(rowCounts.get(student.id)||0)+1);matchedByRow.set(row.lineNumber,student);
        }
        for(const row of parsed.rows){const student=matchedByRow.get(row.lineNumber);for(const col of mapped){const raw=row.values[col.index]??'';if(!raw.trim())continue;const current=student?.id?scoreRows.find(r=>r.studentId===student.id&&r.subjectId===col.subjectId)?.[col.field]??null:null;
          let problem='';let value:number|null=null;if(!student)problem=row.admissionNo||row.fullName?'Student not found':'Student not found';else if(student.ambiguous)problem='Name matches more than one student; admission number required.';else if((rowCounts.get(student.id)||0)>1)problem='Duplicate student in import file.';else if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()))problem='Not a number.';else {value=Number(raw);const max=col.field==='ca'?30:70;if(!Number.isFinite(value)||value<0||value>max)problem=`${col.field==='ca'?'CA':'Exam'} above allowed range (0–${max}).`;else if(Math.round(value*10)!==value*10)problem='Score allows one decimal place.';}
          entries.push({id:`${row.lineNumber}:${col.subjectId}:${col.field}`,lineNumber:row.lineNumber,studentName:student?.fullName||row.fullName||row.admissionNo||'(unknown student)',studentId:student?.id||null,admissionNo:row.admissionNo,subjectId:col.subjectId,subjectName:col.subjectName,field:col.field,currentScore:current,newScore:value,rawValue:raw,problem,replaceExisting:input.replaceExisting,apply:!problem&&(input.replaceExisting||current==null)});
        }}
        return {entries,warnings:[...new Set(warnings)],validCount:entries.filter(e=>!e.problem&&e.apply).length,problemCount:entries.filter(e=>e.problem).length,skippedExisting:entries.filter(e=>!e.problem&&!e.apply).length,replaceExisting:input.replaceExisting};
      });
    });
    ipcMain.handle('scores:import-confirm', (_event,input:{classId:string;termId:string;entries:Array<{studentId:string;subjectId:string;field:'ca'|'exam';newScore:number}>})=>withDb(db=>saveImportedScores(db,input.classId,input.termId,input.entries)));

    ipcMain.handle('results:get', (_event,input:{classId:string;termId:string})=>withDb(db=>{
      const classes=db.prepare('SELECT id,name,level,stream FROM classes ORDER BY sort_order,name').all();
      const terms=db.prepare('SELECT t.id,t.session_id AS sessionId,s.name AS sessionName,t.name,t.term_number AS termNumber,t.is_current AS isCurrent FROM terms t JOIN academic_sessions s ON s.id=t.session_id ORDER BY s.name DESC,t.term_number').all();
      const classInfo=db.prepare('SELECT id,name,level,stream,class_master_name AS classMasterName FROM classes WHERE id=?').get(input.classId);
      const students=db.prepare('SELECT id,full_name AS fullName,admission_no AS admissionNo,gender FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId);
      const subjects=db.prepare('SELECT id,name,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId);
      const scores=db.prepare('SELECT sc.student_id AS studentId,sc.subject_id AS subjectId,sc.ca,sc.exam FROM scores sc JOIN students st ON st.id=sc.student_id WHERE st.class_id=? AND sc.term_id=?').all(input.classId,input.termId);
      const grades=db.prepare('SELECT grade,min_score AS minScore,remark FROM grading_scale ORDER BY min_score DESC').all();
      const traits=db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all();
      const ratings=db.prepare('SELECT student_id AS studentId,trait_id AS traitId,rating FROM student_ratings WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId);
      const remarks=db.prepare('SELECT student_id AS studentId,class_master_remark AS classMasterRemark,director_remark AS directorRemark FROM term_remarks WHERE term_id=? AND student_id IN (SELECT id FROM students WHERE class_id=?)').all(input.termId,input.classId);
      return {classes,terms,classInfo,students,subjects,scores,grades,traits,ratings,remarks};
    }));
    ipcMain.handle('results:export',async(_event,input:{classId:string;termId:string;format:'xlsx'|'csv';rows:any[];subjects:Array<{id:string;name:string}>})=>{
      const className=withDb(db=>(db.prepare('SELECT name FROM classes WHERE id=?').get(input.classId) as {name:string}|undefined)?.name||'Class');
      const headers=['Position','Admission No','Student Name',...input.subjects.map(s=>s.name),'Total','Average','Subjects Counted'];
      const data=input.rows.map(r=>[r.positionLabel,r.admissionNo||'',r.fullName,...input.subjects.map(s=>r.subjectTotals[s.id]??''),r.total??'',r.average==null?'':Number(r.average.toFixed(2)),r.subjectsCounted]);
      let bytes:Buffer;let ext=input.format;
      if(input.format==='csv'){
        const quote=(v:unknown)=>{const x=String(v??'');return /[",\r\n;]/.test(x)?`"${x.replace(/"/g,'""')}"`:x;};
        bytes=Buffer.from('\uFEFF'+[headers,...data].map(row=>row.map(quote).join(',')).join('\r\n'),'utf8');
      }else{
        const ExcelJS=(await import('exceljs')).default;const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('Class Results');sheet.addRow(headers);data.forEach(r=>sheet.addRow(r));sheet.views=[{state:'frozen',ySplit:1,xSplit:3,activeCell:'D2'}];sheet.getRow(1).height=34;sheet.getRow(1).eachCell((cell,col)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:col>=4&&col<4+input.subjects.length?'FF2563EB':'FF0B1F4B'}};});sheet.getColumn(1).width=12;sheet.getColumn(2).width=20;sheet.getColumn(3).width=30;for(let c=4;c<=headers.length;c++)sheet.getColumn(c).width=Math.max(15,Math.min(26,String(headers[c-1]).length+4));bytes=Buffer.from(await wb.xlsx.writeBuffer());
      }
      const picked=await dialog.showSaveDialog({title:'Export class results',defaultPath:`${className.replace(/[^\w-]+/g,'-')}-Results.${ext}`,filters:[{name:ext==='xlsx'?'Excel Workbook':'CSV File',extensions:[ext]}]});if(picked.canceled||!picked.filePath)return false;fs.writeFileSync(picked.filePath,bytes);return true;
    });

    ipcMain.handle('report-cards:get-data', (_event, input: { classId: string; termId: string }) => withDb((db) => {
      const school = db.prepare('SELECT school_name AS schoolName,board_name AS boardName,address,logo_path AS logoPath FROM school_settings LIMIT 1').get() as ReportCardData['school'] | undefined;
      const classInfo = db.prepare('SELECT id,name,class_master_name AS classMasterName FROM classes WHERE id=?').get(input.classId) as ReportCardData['classInfo'] | undefined;
      const term = db.prepare('SELECT t.id,t.name,t.next_term_begins AS nextTermBegins,s.name AS sessionName FROM terms t JOIN academic_sessions s ON s.id=t.session_id WHERE t.id=?').get(input.termId) as ReportCardData['term'] | undefined;
      if (!school || !classInfo || !term) throw new Error('Choose a valid class and term.');
      const students = db.prepare('SELECT id,full_name AS fullName,admission_no AS admissionNo,gender FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId) as ReportCardData['students'];
      const subjects = db.prepare('SELECT id,name,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId) as ReportCardData['subjects'];
      const scores = db.prepare('SELECT sc.student_id AS studentId,sc.subject_id AS subjectId,sc.ca,sc.exam FROM scores sc JOIN students st ON st.id=sc.student_id WHERE st.class_id=? AND sc.term_id=? AND st.is_active=1').all(input.classId,input.termId) as ReportCardData['scores'];
      const grades = db.prepare('SELECT grade,min_score AS minScore,remark FROM grading_scale ORDER BY min_score DESC').all() as ReportCardData['grades'];
      const traits = db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all() as ReportCardData['traits'];
      const ratings = db.prepare('SELECT sr.student_id AS studentId,sr.trait_id AS traitId,sr.rating FROM student_ratings sr JOIN students st ON st.id=sr.student_id WHERE sr.term_id=? AND st.class_id=? AND st.is_active=1').all(input.termId,input.classId) as ReportCardData['ratings'];
      const remarks = db.prepare('SELECT tr.student_id AS studentId,tr.class_master_remark AS classMasterRemark,tr.director_remark AS directorRemark FROM term_remarks tr JOIN students st ON st.id=tr.student_id WHERE tr.term_id=? AND st.class_id=? AND st.is_active=1').all(input.termId,input.classId) as ReportCardData['remarks'];
      return { school, classInfo, term, students, subjects, scores, grades, traits, ratings, remarks };
    }));

    ipcMain.handle('report-cards:generate', async (event, input: ReportCardOptions & { classId: string; termId: string }) => {
      if (activeReportWorker) throw new Error('A report-card job is already running.');
      const data = withDb((db) => {
        const school = db.prepare('SELECT school_name AS schoolName,board_name AS boardName,address,logo_path AS logoPath FROM school_settings LIMIT 1').get() as ReportCardData['school'] | undefined;
        const classInfo = db.prepare('SELECT id,name,class_master_name AS classMasterName FROM classes WHERE id=?').get(input.classId) as ReportCardData['classInfo'] | undefined;
        const term = db.prepare('SELECT t.id,t.name,t.next_term_begins AS nextTermBegins,s.name AS sessionName FROM terms t JOIN academic_sessions s ON s.id=t.session_id WHERE t.id=?').get(input.termId) as ReportCardData['term'] | undefined;
        if (!school || !classInfo || !term) throw new Error('Choose a valid class and term.');
        const students = db.prepare('SELECT id,full_name AS fullName,admission_no AS admissionNo,gender FROM students WHERE class_id=? AND is_active=1 ORDER BY full_name COLLATE NOCASE').all(input.classId) as ReportCardData['students'];
        const subjects = db.prepare('SELECT id,name,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(input.classId) as ReportCardData['subjects'];
        const scores = db.prepare('SELECT sc.student_id AS studentId,sc.subject_id AS subjectId,sc.ca,sc.exam FROM scores sc JOIN students st ON st.id=sc.student_id WHERE st.class_id=? AND sc.term_id=? AND st.is_active=1').all(input.classId,input.termId) as ReportCardData['scores'];
        const grades = db.prepare('SELECT grade,min_score AS minScore,remark FROM grading_scale ORDER BY min_score DESC').all() as ReportCardData['grades'];
        const traits = db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all() as ReportCardData['traits'];
        const ratings = db.prepare('SELECT sr.student_id AS studentId,sr.trait_id AS traitId,sr.rating FROM student_ratings sr JOIN students st ON st.id=sr.student_id WHERE sr.term_id=? AND st.class_id=? AND st.is_active=1').all(input.termId,input.classId) as ReportCardData['ratings'];
        const remarks = db.prepare('SELECT tr.student_id AS studentId,tr.class_master_remark AS classMasterRemark,tr.director_remark AS directorRemark FROM term_remarks tr JOIN students st ON st.id=tr.student_id WHERE tr.term_id=? AND st.class_id=? AND st.is_active=1').all(input.termId,input.classId) as ReportCardData['remarks'];
        return { school, classInfo, term, students, subjects, scores, grades, traits, ratings, remarks } satisfies ReportCardData;
      });
      if (!data.students.length) throw new Error('There are no active students in this class.');
      if (!data.subjects.length) throw new Error('This class has no subjects. Add subjects before generating report cards.');
      const reportsDirectory = path.join(app.getPath('documents'), 'GDSS Reports');
      fs.mkdirSync(reportsDirectory, { recursive: true });
      const safePart = (value: string) => value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Report';
      const classLabel = safePart(data.classInfo.name.replace(/\s+/g, ''));
      const termLabel = safePart(data.term.name.replace(/\s+/g, ''));
      const sessionLabel = safePart(data.term.sessionName.trim().replace(/\s*[\/\\]+\s*/g, '-').replace(/\s+/g, ''));
      const defaultName = `${classLabel}_${termLabel}_${sessionLabel}.pdf`;
      let outputPath: string;
      if (input.separateFiles) {
        const picked = await dialog.showOpenDialog({ title: 'Choose folder for individual report cards', defaultPath: reportsDirectory, properties: ['openDirectory', 'createDirectory'] });
        if (picked.canceled || !picked.filePaths[0]) return { files: [], cancelled: true };
        outputPath = picked.filePaths[0];
      } else {
        const picked = await dialog.showSaveDialog({ title: 'Save report-card PDF', defaultPath: path.join(reportsDirectory, defaultName), filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
        if (picked.canceled || !picked.filePath) return { files: [], cancelled: true };
        outputPath = picked.filePath.toLowerCase().endsWith('.pdf') ? picked.filePath : `${picked.filePath}.pdf`;
      }
      const assetsDir = app.isPackaged ? path.join(process.resourcesPath, 'report-assets') : path.join(__dirname, '../../build/report-assets');
      const workerPath = path.join(__dirname, 'pdfWorker.js');
      const worker = utilityProcess.fork(workerPath, [], { serviceName: 'GDSS report-card PDF generator' });
      activeReportWorker = worker;
      return await new Promise<{ files: string[]; cancelled?: boolean }>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => { if (settled) return; settled = true; if (activeReportWorker === worker) activeReportWorker = null; try { worker.kill(); } catch { /* already stopped */ } fn(); };
        worker.on('message', (message: any) => {
          if (!message || typeof message !== 'object') return;
          if (message.type === 'progress') event.sender.send('report-cards:progress', { done: message.done, total: message.total, currentName: message.currentName });
          else if (message.type === 'complete') finish(() => resolve({ files: message.files as string[] }));
          else if (message.type === 'error') finish(() => /cancel/i.test(String(message.message)) ? resolve({ files: [], cancelled: true }) : reject(new Error(String(message.message || 'Could not generate report cards.'))));
        });
        worker.on('exit', (code) => { if (!settled) finish(() => reject(new Error(`Report-card generator stopped unexpectedly (${code}).`))); });
        worker.postMessage({ type: 'start', data, options: { studentIds: input.studentIds, order: input.order, includeTypedRemarks: input.includeTypedRemarks, separateFiles: input.separateFiles }, outputPath, assetsDir });
      });
    });
    ipcMain.handle('report-cards:cancel', () => { if (activeReportWorker) { activeReportWorker.postMessage({ type: 'cancel' }); return true; } return false; });
    ipcMain.handle('report-cards:file-action', async (_event, input: { action: 'open'|'folder'|'print'; files: string[] }) => {
      const files = (input.files || []).filter((file) => typeof file === 'string' && path.extname(file).toLowerCase() === '.pdf' && fs.existsSync(file));
      if (!files.length) throw new Error('The saved PDF file could not be found.');
      const target = files[0];
      if (input.action === 'folder') { shell.showItemInFolder(target); return true; }
      if (input.action === 'print') {
        if (process.platform === 'win32') await new Promise<void>((resolve, reject) => execFile('cmd.exe', ['/c', 'start', '', '/min', target, '/p'], (error) => error ? reject(error) : resolve()));
        else await shell.openPath(target);
        return true;
      }
      await shell.openPath(target); return true;
    });

    ipcMain.handle('app:get-version', () => app.getVersion());
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}