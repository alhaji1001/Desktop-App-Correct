import { contextBridge, ipcRenderer } from 'electron';

export type DesktopBridge = {
  getAppVersion: () => Promise<string>;
  setupComplete: (input:{schoolName:string;address?:string;phone?:string;sessionName:string;termNumber:number;classes:Array<{name:string;level:'SS1'|'SS2'|'SS3';stream?:string}>}) => Promise<{ok:boolean}>;
  dashboardGet: () => Promise<any>;
  backupCreate: () => Promise<{cancelled:boolean;path?:string}>;
  backupRestore: () => Promise<{cancelled:boolean;safetyCopy?:string;restartRequired?:boolean}>;
  settingsGet: () => Promise<any>;
  settingsSaveSchool: (input: { schoolName: string; boardName: string; address: string; phone: string }) => Promise<any>;
  settingsChooseLogo: () => Promise<any>;
  settingsCreateSession: (name: string) => Promise<any>;
  settingsSetCurrentTerm: (termId: string) => Promise<any>;
  settingsSaveTerm: (input: { id: string; startDate: string | null; endDate: string | null; nextTermBegins: string | null }) => Promise<any>;
  settingsSaveGrades: (rows: Array<{ id?: string; grade: string; minScore: number; remark: string }>) => Promise<any>;
  settingsSaveTraits: (rows: Array<{ id?: string; name: string; group: 'skills' | 'behaviour'; sortOrder: number }>) => Promise<any>;
  settingsPromote: (sourceClassId: string, targetClassId: string) => Promise<any>;
  classesGet: () => Promise<any>;
  classesAddStream: (level: 'SS1'|'SS2'|'SS3') => Promise<any>;
  classesDelete: (classId: string) => Promise<any>;
  classesSaveMaster: (classId: string, name: string) => Promise<any>;
  subjectsAdd: (classId: string, name: string) => Promise<any>;
  subjectsRename: (subjectId: string, classId: string, name: string) => Promise<any>;
  subjectsDelete: (subjectId: string) => Promise<any>;
  subjectsMove: (classId: string, subjectId: string, direction: -1|1) => Promise<any>;
  subjectsCopy: (sourceClassId: string, targetClassIds: string[]) => Promise<number>;
  studentsList: () => Promise<any>;
  studentsSave: (input: {id?:string;classId:string;fullName:string;admissionNo:string;gender:'M'|'F';isActive?:boolean}) => Promise<any>;
  studentsDelete: (studentId:string) => Promise<boolean>;
  studentsChooseImport: (targetClassId:string) => Promise<any>;
  studentsImportValid: (input:{classId:string;rows:Array<{fullName:string;gender:'M'|'F';admissionNo:string}>}) => Promise<{imported:number;skipped:number}>;
  studentsDownloadTemplate: (format:'xlsx'|'csv') => Promise<boolean>;
  scoresGet: (classId:string, termId:string) => Promise<any>;
  scoresSave: (input:{studentId:string;subjectId:string;termId:string;ca:number|null;exam:number|null}) => Promise<any>;
  scoresSaveRating: (input:{studentId:string;termId:string;traitId:string;rating:number}) => Promise<any>;
  scoresSaveRemarks: (input:{studentId:string;termId:string;classMasterRemark:string;directorRemark:string}) => Promise<any>;
  scoresDownloadTemplate: (input:{classId:string;termId:string;subjectId:string|null;format:'xlsx'|'csv'}) => Promise<boolean>;
  scoresChooseImport: (input:{classId:string;termId:string;selectedSubjectId:string|null;replaceExisting:boolean}) => Promise<any>;
  scoresImportConfirm: (input:{classId:string;termId:string;entries:Array<{studentId:string;subjectId:string;field:'ca'|'exam';newScore:number}>}) => Promise<{imported:number;skipped:number}>;
  resultsGet: (classId:string,termId:string) => Promise<any>;
  resultsExport: (input:{classId:string;termId:string;format:'xlsx'|'csv';rows:any[];subjects:Array<{id:string;name:string}>}) => Promise<boolean>;
  reportCardsGetData: (classId:string, termId:string) => Promise<any>;
  reportCardsGenerate: (input:{classId:string;termId:string;studentIds:string[];order:'name'|'position';includeTypedRemarks:boolean;separateFiles:boolean}) => Promise<{files:string[];cancelled?:boolean}>;
  reportCardsCancel: () => Promise<boolean>;
  reportCardsFileAction: (action:'open'|'folder'|'print', files:string[]) => Promise<boolean>;
  onReportCardsProgress: (callback:(progress:{done:number;total:number;currentName:string})=>void) => () => void;
};

const bridge: DesktopBridge = {
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  setupComplete: (input) => ipcRenderer.invoke('setup:complete', input),
  dashboardGet: () => ipcRenderer.invoke('dashboard:get'),
  backupCreate: () => ipcRenderer.invoke('backup:create'),
  backupRestore: () => ipcRenderer.invoke('backup:restore'),
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSaveSchool: (input) => ipcRenderer.invoke('settings:save-school', input),
  settingsChooseLogo: () => ipcRenderer.invoke('settings:choose-logo'),
  settingsCreateSession: (name) => ipcRenderer.invoke('settings:create-session', name),
  settingsSetCurrentTerm: (termId) => ipcRenderer.invoke('settings:set-current-term', termId),
  settingsSaveTerm: (input) => ipcRenderer.invoke('settings:save-term', input),
  settingsSaveGrades: (rows) => ipcRenderer.invoke('settings:save-grades', rows),
  settingsSaveTraits: (rows) => ipcRenderer.invoke('settings:save-traits', rows),
  settingsPromote: (sourceClassId, targetClassId) => ipcRenderer.invoke('settings:promote', { sourceClassId, targetClassId }),
  classesGet: () => ipcRenderer.invoke('classes:get'),
  classesAddStream: (level) => ipcRenderer.invoke('classes:add-stream', level),
  classesDelete: (classId) => ipcRenderer.invoke('classes:delete', classId),
  classesSaveMaster: (classId, name) => ipcRenderer.invoke('classes:save-master', { classId, name }),
  subjectsAdd: (classId, name) => ipcRenderer.invoke('subjects:add', { classId, name }),
  subjectsRename: (subjectId, classId, name) => ipcRenderer.invoke('subjects:rename', { subjectId, classId, name }),
  subjectsDelete: (subjectId) => ipcRenderer.invoke('subjects:delete', subjectId),
  subjectsMove: (classId, subjectId, direction) => ipcRenderer.invoke('subjects:move', { classId, subjectId, direction }),
  subjectsCopy: (sourceClassId, targetClassIds) => ipcRenderer.invoke('subjects:copy', { sourceClassId, targetClassIds }),
  studentsList: () => ipcRenderer.invoke('students:list'),
  studentsSave: (input) => ipcRenderer.invoke('students:save', input),
  studentsDelete: (studentId) => ipcRenderer.invoke('students:delete', studentId),
  studentsChooseImport: (targetClassId) => ipcRenderer.invoke('students:choose-import', targetClassId),
  studentsImportValid: (input) => ipcRenderer.invoke('students:import-valid', input),
  studentsDownloadTemplate: (format) => ipcRenderer.invoke('students:download-template', format),
  scoresGet: (classId, termId) => ipcRenderer.invoke('scores:get', {classId, termId}),
  scoresSave: (input) => ipcRenderer.invoke('scores:save', input),
  scoresSaveRating: (input) => ipcRenderer.invoke('scores:save-rating', input),
  scoresSaveRemarks: (input) => ipcRenderer.invoke('scores:save-remarks', input),
  scoresDownloadTemplate: (input) => ipcRenderer.invoke('scores:download-template', input),
  scoresChooseImport: (input) => ipcRenderer.invoke('scores:choose-import', input),
  scoresImportConfirm: (input) => ipcRenderer.invoke('scores:import-confirm', input),
  resultsGet: (classId,termId) => ipcRenderer.invoke('results:get', {classId,termId}),
  resultsExport: (input) => ipcRenderer.invoke('results:export', input),
  reportCardsGetData: (classId, termId) => ipcRenderer.invoke('report-cards:get-data', {classId,termId}),
  reportCardsGenerate: (input) => ipcRenderer.invoke('report-cards:generate', input),
  reportCardsCancel: () => ipcRenderer.invoke('report-cards:cancel'),
  reportCardsFileAction: (action, files) => ipcRenderer.invoke('report-cards:file-action', {action,files}),
  onReportCardsProgress: (callback) => { const listener = (_event: Electron.IpcRendererEvent, progress: {done:number;total:number;currentName:string}) => callback(progress); ipcRenderer.on('report-cards:progress', listener); return () => ipcRenderer.removeListener('report-cards:progress', listener); }
};

contextBridge.exposeInMainWorld('desktop', bridge);