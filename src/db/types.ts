export type UUID = string;
export type Gender = 'M' | 'F';
export type RatingGroup = 'skills' | 'behaviour';

export interface SchoolSettings {
  id: UUID;
  schoolName: string;
  address: string;
  phone: string;
  logoPath: string | null;
}
export interface SchoolClass {
  id: UUID; name: string; level: 'SS1' | 'SS2' | 'SS3'; stream: string | null;
  classMasterName: string | null; sortOrder: number;
}
export interface AcademicSession { id: UUID; name: string; isCurrent: boolean; }
export interface Term {
  id: UUID; sessionId: UUID; termNumber: number; name: string; startDate: string | null;
  endDate: string | null; nextTermBegins: string | null; isCurrent: boolean;
}
export interface Subject { id: UUID; classId: UUID; name: string; sortOrder: number; }
export interface Student {
  id: UUID; classId: UUID; admissionNo: string | null; fullName: string; gender: Gender; isActive: boolean;
}
export interface Score {
  id: UUID; studentId: UUID; subjectId: UUID; termId: UUID; ca: number | null; exam: number | null;
  total: number | null;
}
export interface GradingScale { id: UUID; grade: string; minScore: number; remark: string; isPlaceholder: boolean; }
export interface RatingTrait { id: UUID; name: string; group: RatingGroup; sortOrder: number; }
export interface StudentRating { id: UUID; studentId: UUID; termId: UUID; traitId: UUID; rating: number; }
export interface TermRemark {
  id: UUID; studentId: UUID; termId: UUID; classMasterRemark: string; directorRemark: string;
}

export interface SchoolSettingsRepository {
  get(): SchoolSettings;
  update(input: Omit<SchoolSettings, 'id'>): SchoolSettings;
}
export interface ClassRepository {
  list(): SchoolClass[];
  create(input: Omit<SchoolClass, 'id'>): SchoolClass;
  update(id: UUID, input: Omit<SchoolClass, 'id'>): SchoolClass;
  delete(id: UUID): void;
}
export interface StudentRepository {
  listByClass(classId: UUID, activeOnly?: boolean): Student[];
  create(input: Omit<Student, 'id'>): Student;
  update(id: UUID, input: Omit<Student, 'id'>): Student;
  delete(id: UUID): void;
}
export interface ScoreRepository {
  listForTermClass(classId: UUID, termId: UUID): Score[];
  upsert(input: Omit<Score, 'id' | 'total'>): Score;
}
export interface GradingRepository { list(): GradingScale[]; }
export interface RatingRepository {
  traits(): RatingTrait[];
  save(input: Omit<StudentRating, 'id'>): StudentRating;
  remarks(): TermRemark[];
}
export interface AcademicRepository {
  sessions(): AcademicSession[];
  terms(sessionId?: UUID): Term[];
  subjects(classId: UUID): Subject[];
}
