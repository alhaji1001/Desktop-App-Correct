import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from './database';
import type {
  AcademicRepository, ClassRepository, GradingRepository, RatingRepository, SchoolSettingsRepository,
  ScoreRepository, StudentRepository, UUID
} from './types';
import { getScoreTotal } from './database';

function bool(value: number): boolean { return value === 1; }

export function createRepositories(db: SqliteDatabase) {
  const schoolSettings: SchoolSettingsRepository = {
    get() {
      const row = db.prepare('SELECT id, school_name AS schoolName, address, phone, logo_path AS logoPath FROM school_settings LIMIT 1').get();
      if (!row) throw new Error('School settings are missing.');
      return row as ReturnType<SchoolSettingsRepository['get']>;
    },
    update(input) {
      const current = this.get();
      db.prepare('UPDATE school_settings SET school_name=?, address=?, phone=?, logo_path=? WHERE id=?')
        .run(input.schoolName.trim(), input.address.trim(), input.phone.trim(), input.logoPath, current.id);
      return this.get();
    }
  };

  const classes: ClassRepository = {
    list: () => db.prepare('SELECT id, name, level, stream, class_master_name AS classMasterName, sort_order AS sortOrder FROM classes ORDER BY sort_order, name').all() as ReturnType<ClassRepository['list']>,
    create(input) {
      const row = { id: randomUUID(), ...input, name: input.name.trim() };
      if (!row.name) throw new Error('Enter a class name.');
      db.prepare('INSERT INTO classes(id,name,level,stream,class_master_name,sort_order) VALUES (@id,@name,@level,@stream,@classMasterName,@sortOrder)').run(row);
      return row;
    },
    update(id, input) {
      const row = { id, ...input, name: input.name.trim() };
      if (!row.name) throw new Error('Enter a class name.');
      const result = db.prepare('UPDATE classes SET name=?,level=?,stream=?,class_master_name=?,sort_order=? WHERE id=?')
        .run(row.name, row.level, row.stream, row.classMasterName, row.sortOrder, id);
      if (!result.changes) throw new Error('Class not found.');
      return row;
    },
    delete(id) {
      try {
        const result = db.prepare('DELETE FROM classes WHERE id=?').run(id);
        if (!result.changes) throw new Error('Class not found.');
      } catch (error) {
        if (error instanceof Error && error.message === 'Class not found.') throw error;
        throw new Error('This class cannot be deleted because students or records still depend on it.');
      }
    }
  };

  const students: StudentRepository = {
    listByClass(classId, activeOnly = false) {
      const rows = db.prepare(`SELECT id,class_id AS classId,admission_no AS admissionNo,full_name AS fullName,gender,is_active AS isActive
        FROM students WHERE class_id=? ${activeOnly ? 'AND is_active=1' : ''} ORDER BY full_name COLLATE NOCASE`).all(classId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({ ...r, isActive: bool(r.isActive as number) })) as ReturnType<StudentRepository['listByClass']>;
    },
    create(input) {
      const row = { id: randomUUID(), ...input, admissionNo: input.admissionNo?.trim() || null, fullName: input.fullName.trim() };
      if (!row.fullName) throw new Error('Enter the student name.');
      db.prepare('INSERT INTO students(id,class_id,admission_no,full_name,gender,is_active) VALUES (@id,@classId,@admissionNo,@fullName,@gender,@isActive)')
        .run({ ...row, isActive: row.isActive ? 1 : 0 });
      return row;
    },
    update(id, input) {
      const row = { ...input, admissionNo: input.admissionNo?.trim() || null, fullName: input.fullName.trim() };
      if (!row.fullName) throw new Error('Enter the student name.');
      const result = db.prepare('UPDATE students SET class_id=?,admission_no=?,full_name=?,gender=?,is_active=? WHERE id=?')
        .run(row.classId, row.admissionNo, row.fullName, row.gender, row.isActive ? 1 : 0, id);
      if (!result.changes) throw new Error('Student not found.');
      return { id, ...row };
    },
    delete(id) {
      try {
        const result = db.prepare('DELETE FROM students WHERE id=?').run(id);
        if (!result.changes) throw new Error('Student not found.');
      } catch (error) {
        if (error instanceof Error && error.message === 'Student not found.') throw error;
        throw new Error('This student could not be deleted because related records depend on it.');
      }
    }
  };

  const scores: ScoreRepository = {
    listForTermClass(classId, termId) {
      const rows = db.prepare(`SELECT s.id,s.student_id AS studentId,s.subject_id AS subjectId,s.term_id AS termId,s.ca,s.exam
        FROM scores s JOIN students st ON st.id=s.student_id
        WHERE st.class_id=? AND s.term_id=? ORDER BY st.full_name`).all(classId, termId) as Array<Record<string, unknown>>;
      return rows.map((r) => ({ ...r, total: getScoreTotal(r.ca as number | null, r.exam as number | null) })) as ReturnType<ScoreRepository['listForTermClass']>;
    },
    upsert(input) {
      if (input.ca != null && (!Number.isFinite(input.ca) || input.ca < 0 || input.ca > 30)) throw new Error('CA must be between 0 and 30.');
      if (input.exam != null && (!Number.isFinite(input.exam) || input.exam < 0 || input.exam > 70)) throw new Error('Exam must be between 0 and 70.');
      db.prepare(`INSERT INTO scores(id,student_id,subject_id,term_id,ca,exam) VALUES (?,?,?,?,?,?)
        ON CONFLICT(student_id,subject_id,term_id) DO UPDATE SET ca=excluded.ca,exam=excluded.exam`)
        .run(randomUUID(), input.studentId, input.subjectId, input.termId, input.ca, input.exam);
      const row = db.prepare('SELECT id,student_id AS studentId,subject_id AS subjectId,term_id AS termId,ca,exam FROM scores WHERE student_id=? AND subject_id=? AND term_id=?')
        .get(input.studentId, input.subjectId, input.termId) as Omit<Parameters<ScoreRepository['upsert']>[0], never> & { id: string; ca: number | null; exam: number | null };
      return { ...row, total: getScoreTotal(row.ca, row.exam) };
    }
  };

  const grading: GradingRepository = {
    list: () => db.prepare('SELECT id,grade,min_score AS minScore,remark,is_placeholder AS isPlaceholder FROM grading_scale ORDER BY min_score DESC')
      .all().map((r) => ({ ...(r as object), isPlaceholder: bool((r as { isPlaceholder: number }).isPlaceholder) })) as ReturnType<GradingRepository['list']>
  };

  const ratings: RatingRepository = {
    traits: () => db.prepare('SELECT id,name,trait_group AS "group",sort_order AS sortOrder FROM rating_traits ORDER BY trait_group,sort_order,name').all() as ReturnType<RatingRepository['traits']>,
    save(input) {
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Rating must be from 1 to 5.');
      db.prepare(`INSERT INTO student_ratings(id,student_id,term_id,trait_id,rating) VALUES (?,?,?,?,?)
        ON CONFLICT(student_id,term_id,trait_id) DO UPDATE SET rating=excluded.rating`)
        .run(randomUUID(), input.studentId, input.termId, input.traitId, input.rating);
      return db.prepare('SELECT id,student_id AS studentId,term_id AS termId,trait_id AS traitId,rating FROM student_ratings WHERE student_id=? AND term_id=? AND trait_id=?')
        .get(input.studentId, input.termId, input.traitId) as ReturnType<RatingRepository['save']>;
    },
    remarks: () => db.prepare('SELECT id,student_id AS studentId,term_id AS termId,class_master_remark AS classMasterRemark,director_remark AS directorRemark FROM term_remarks').all() as ReturnType<RatingRepository['remarks']>
  };

  const academic: AcademicRepository = {
    sessions: () => db.prepare('SELECT id,name,is_current AS isCurrent FROM academic_sessions ORDER BY name DESC').all()
      .map((r) => ({ ...(r as object), isCurrent: bool((r as { isCurrent: number }).isCurrent) })) as ReturnType<AcademicRepository['sessions']>,
    terms(sessionId) {
      const rows = sessionId
        ? db.prepare('SELECT id,session_id AS sessionId,term_number AS termNumber,name,start_date AS startDate,end_date AS endDate,next_term_begins AS nextTermBegins,is_current AS isCurrent FROM terms WHERE session_id=? ORDER BY term_number').all(sessionId)
        : db.prepare('SELECT id,session_id AS sessionId,term_number AS termNumber,name,start_date AS startDate,end_date AS endDate,next_term_begins AS nextTermBegins,is_current AS isCurrent FROM terms ORDER BY term_number').all();
      return rows.map((r) => ({ ...(r as object), isCurrent: bool((r as { isCurrent: number }).isCurrent) })) as ReturnType<AcademicRepository['terms']>;
    },
    subjects(classId) {
      return db.prepare('SELECT id,class_id AS classId,name,sort_order AS sortOrder FROM subjects WHERE class_id=? ORDER BY sort_order,name').all(classId) as ReturnType<AcademicRepository['subjects']>;
    }
  };

  return { schoolSettings, classes, students, scores, grading, ratings, academic };
}