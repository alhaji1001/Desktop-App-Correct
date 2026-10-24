import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SqliteDatabase } from '../src/db/database';
import { createDatabase } from '../src/db/database';
import { createRepositories } from '../src/db/repositories';

describe('SQLite local data layer', () => {
  let db: SqliteDatabase;
  let repos: ReturnType<typeof createRepositories>;
  beforeEach(() => { db = createDatabase(':memory:'); repos = createRepositories(db); });
  afterEach(() => db.close());

  it('migrates schema, enables foreign keys and seeds marked placeholder grading', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(repos.schoolSettings.get().schoolName).toBe('GDSS Dutse');
    expect(repos.grading.list().map((g) => [g.grade, g.minScore, g.isPlaceholder])).toEqual([
      ['A',70,true], ['B',60,true], ['C',50,true], ['D',45,true], ['E',40,true], ['F',0,true]
    ]);
    expect(repos.ratings.traits()).toEqual([]);
  });

  it('creates classes, students, terms and subjects and stores scores once per key', () => {
    const cls = repos.classes.create({ name: 'SS1 A', level: 'SS1', stream: 'A', classMasterName: null, sortOrder: 0 });
    const sessionId = 'session-test';
    db.prepare('INSERT INTO academic_sessions(id,name,is_current) VALUES(?,?,1)').run(sessionId, '2026/2027');
    db.prepare('INSERT INTO terms(id,session_id,term_number,name,is_current) VALUES(?,?,?,?,1)').run('term-test', sessionId, 1, 'First Term');
    db.prepare('INSERT INTO subjects(id,class_id,name,sort_order) VALUES(?,?,?,?)').run('subject-test', cls.id, 'English', 0);
    const student = repos.students.create({ classId: cls.id, admissionNo: 'ADM-1', fullName: 'Amina Musa', gender: 'F', isActive: true });
    const score = repos.scores.upsert({ studentId: student.id, subjectId: 'subject-test', termId: 'term-test', ca: 25.5, exam: 60 });
    expect(score.total).toBe(85.5);
    expect(repos.scores.upsert({ studentId: student.id, subjectId: 'subject-test', termId: 'term-test', ca: 20, exam: 55 }).id).toBe(score.id);
    expect(repos.scores.listForTermClass(cls.id, 'term-test')).toHaveLength(1);
    expect(repos.scores.listForTermClass(cls.id, 'term-test')[0].total).toBe(75);
  });

  it('enforces unique admission numbers and valid score bounds', () => {
    const cls = repos.classes.create({ name: 'SS2 A', level: 'SS2', stream: 'A', classMasterName: null, sortOrder: 0 });
    repos.students.create({ classId: cls.id, admissionNo: 'ADM-2', fullName: 'Student One', gender: 'M', isActive: true });
    expect(() => repos.students.create({ classId: cls.id, admissionNo: 'ADM-2', fullName: 'Student Two', gender: 'F', isActive: true })).toThrow();
    expect(() => repos.scores.upsert({ studentId: 'x', subjectId: 'y', termId: 'z', ca: 31, exam: 20 })).toThrow('CA must be between 0 and 30.');
  });

  it('saves ratings only from 1 through 5', () => {
    const cls = repos.classes.create({ name: 'SS3', level: 'SS3', stream: null, classMasterName: null, sortOrder: 0 });
    db.prepare('INSERT INTO academic_sessions(id,name) VALUES(?,?)').run('s', '2025/2026');
    db.prepare('INSERT INTO terms(id,session_id,term_number,name) VALUES(?,?,?,?)').run('t', 's', 1, 'First Term');
    const student = repos.students.create({ classId: cls.id, admissionNo: null, fullName: 'Student', gender: 'M', isActive: true });
    db.prepare('INSERT INTO rating_traits(id,name,trait_group,sort_order) VALUES(?,?,?,?)').run('trait', 'Punctuality', 'behaviour', 0);
    expect(repos.ratings.save({ studentId: student.id, termId: 't', traitId: 'trait', rating: 4 }).rating).toBe(4);
    expect(() => repos.ratings.save({ studentId: student.id, termId: 't', traitId: 'trait', rating: 6 })).toThrow('Rating must be from 1 to 5.');
  });
});