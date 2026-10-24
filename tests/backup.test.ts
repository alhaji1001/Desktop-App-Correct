import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/db/database';
import { createDailyBackup, createManualBackup, pruneBackups, restoreDatabase } from '../src/db/backup';

const tempDirs: string[] = [];
function tempDir() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdss-backup-')); tempDirs.push(dir); return dir; }
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('backup helpers', () => {
  it('makes one daily backup and prunes to the latest 14', () => {
    const dir = tempDir(), dbPath = path.join(dir, 'school.db'), backups = path.join(dir, 'Backups');
    const db = createDatabase(dbPath); db.close();
    const first = createDailyBackup({ databasePath: dbPath, backupDirectory: backups, now: new Date('2026-10-01T09:00:00Z') });
    expect(first).toBe(path.join(backups, 'gdss-daily-2026-10-01.db'));
    expect(createDailyBackup({ databasePath: dbPath, backupDirectory: backups, now: new Date('2026-10-01T18:00:00Z') })).toBe(first);
    for (let i = 1; i <= 16; i++) {
      const file = path.join(backups, `gdss-daily-2026-10-${String(i).padStart(2, '0')}.db`);
      fs.writeFileSync(file, 'placeholder');
      fs.utimesSync(file, new Date(2026, 9, i), new Date(2026, 9, i));
    }
    pruneBackups(backups, 14);
    expect(fs.readdirSync(backups).filter((f) => /^gdss-daily-/.test(f))).toHaveLength(14);
  });

  it('creates manual copy and requires confirmation plus safety copy to restore', () => {
    const dir = tempDir(), dbPath = path.join(dir, 'school.db'), manual = path.join(dir, 'manual.db'), safety = path.join(dir, 'safety.db');
    let db = createDatabase(dbPath);
    db.prepare('INSERT INTO classes(id,name,level) VALUES(?,?,?)').run('before', 'Before', 'SS1');
    db.close();
    createManualBackup(dbPath, manual);
    db = new Database(manual);
    db.prepare('INSERT INTO classes(id,name,level) VALUES(?,?,?)').run('after', 'After', 'SS2');
    db.close();
    expect(() => restoreDatabase(manual, dbPath, safety, false)).toThrow('Restore cancelled.');
    restoreDatabase(manual, dbPath, safety, true);
    expect(fs.existsSync(safety)).toBe(true);
    db = new Database(dbPath);
    expect((db.prepare('SELECT name FROM classes ORDER BY name').all() as Array<{name:string}>).map((x) => x.name)).toEqual(['After', 'Before']);
    db.close();
  });
});