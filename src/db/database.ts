import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export type SqliteDatabase = Database.Database;
export const CURRENT_SCHEMA_VERSION = 1;

const schema = `
CREATE TABLE IF NOT EXISTS school_settings (
  id TEXT PRIMARY KEY, school_name TEXT NOT NULL DEFAULT 'GDSS Dutse', board_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', logo_path TEXT
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, level TEXT NOT NULL CHECK(level IN ('SS1','SS2','SS3')),
  stream TEXT, class_master_name TEXT, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS academic_sessions (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_session ON academic_sessions(is_current) WHERE is_current=1;
CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  term_number INTEGER NOT NULL CHECK(term_number BETWEEN 1 AND 3), name TEXT NOT NULL,
  start_date TEXT, end_date TEXT, next_term_begins TEXT, is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
  UNIQUE(session_id, term_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_term ON terms(is_current) WHERE is_current=1;
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(class_id, name)
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  admission_no TEXT UNIQUE, full_name TEXT NOT NULL, gender TEXT NOT NULL CHECK(gender IN ('M','F')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
CREATE INDEX IF NOT EXISTS students_class_name ON students(class_id, full_name);
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  ca REAL CHECK(ca IS NULL OR (ca >= 0 AND ca <= 30)),
  exam REAL CHECK(exam IS NULL OR (exam >= 0 AND exam <= 70)),
  UNIQUE(student_id, subject_id, term_id)
);
CREATE TABLE IF NOT EXISTS grading_scale (
  id TEXT PRIMARY KEY, grade TEXT NOT NULL UNIQUE, min_score REAL NOT NULL CHECK(min_score BETWEEN 0 AND 100),
  remark TEXT NOT NULL, is_placeholder INTEGER NOT NULL DEFAULT 0 CHECK(is_placeholder IN (0,1))
);
CREATE TABLE IF NOT EXISTS rating_traits (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, trait_group TEXT NOT NULL CHECK(trait_group IN ('skills','behaviour')),
  sort_order INTEGER NOT NULL DEFAULT 0, UNIQUE(name, trait_group)
);
CREATE TABLE IF NOT EXISTS student_ratings (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  trait_id TEXT NOT NULL REFERENCES rating_traits(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), UNIQUE(student_id, term_id, trait_id)
);
CREATE TABLE IF NOT EXISTS term_remarks (
  id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  class_master_remark TEXT NOT NULL DEFAULT '', director_remark TEXT NOT NULL DEFAULT '',
  UNIQUE(student_id, term_id)
);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
);
`;

const placeholderGrades = [
  ['A', 70, 'Excellent'], ['B', 60, 'Very Good'], ['C', 50, 'Good'],
  ['D', 45, 'Credit'], ['E', 40, 'Pass'], ['F', 0, 'Fail']
] as const;

export function migrateDatabase(db: SqliteDatabase): void {
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.transaction(() => {
    db.exec(schema);
    const schoolColumns = db.prepare('PRAGMA table_info(school_settings)').all() as Array<{ name: string }>;
    if (!schoolColumns.some((column) => column.name === 'board_name')) db.exec("ALTER TABLE school_settings ADD COLUMN board_name TEXT NOT NULL DEFAULT ''");
    const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(CURRENT_SCHEMA_VERSION);
    if (!applied) {
      const now = new Date().toISOString();
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(CURRENT_SCHEMA_VERSION, now);
    }
    if ((db.prepare('SELECT COUNT(*) AS count FROM school_settings').get() as { count: number }).count === 0) {
      db.prepare('INSERT INTO school_settings(id, school_name) VALUES (?, ?)').run(randomUUID(), 'GDSS Dutse');
    }
    if ((db.prepare('SELECT COUNT(*) AS count FROM grading_scale').get() as { count: number }).count === 0) {
      const insert = db.prepare('INSERT INTO grading_scale(id, grade, min_score, remark, is_placeholder) VALUES (?, ?, ?, ?, 1)');
      for (const [grade, min, remark] of placeholderGrades) insert.run(randomUUID(), grade, min, remark);
    }
  })();
}

export function createDatabase(filename = ':memory:'): SqliteDatabase {
  const db = new Database(filename);
  migrateDatabase(db);
  return db;
}

export function seedDefaultRatingTraits(db: SqliteDatabase): void {
  // The Android source has no built-in/default trait list; do not invent trait names.
  // This function intentionally leaves rating_traits empty until the administrator adds traits.
}

export function getScoreTotal(ca: number | null, exam: number | null): number | null {
  return ca == null || exam == null ? null : ca + exam;
}