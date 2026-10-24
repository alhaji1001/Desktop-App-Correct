import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export interface BackupOptions { databasePath: string; backupDirectory: string; now?: Date; keep?: number; }

function dateStamp(date: Date): string { return date.toISOString().slice(0, 10); }

export function createDailyBackup(options: BackupOptions): string | null {
  if (options.databasePath === ':memory:' || !fs.existsSync(options.databasePath)) return null;
  fs.mkdirSync(options.backupDirectory, { recursive: true });
  const now = options.now ?? new Date();
  const stamp = dateStamp(now);
  const filename = path.join(options.backupDirectory, `gdss-daily-${stamp}.db`);
  if (!fs.existsSync(filename)) {
    const db = new Database(options.databasePath);
    try {
      db.pragma('wal_checkpoint(FULL)');
      fs.copyFileSync(options.databasePath, filename);
    } finally { db.close(); }
  }
  pruneBackups(options.backupDirectory, options.keep ?? 14);
  return filename;
}

export function createManualBackup(databasePath: string, destinationPath: string): string {
  if (!fs.existsSync(databasePath)) throw new Error('The database file could not be found.');
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const db = new Database(databasePath);
  try {
    db.pragma('wal_checkpoint(FULL)');
    fs.copyFileSync(databasePath, destinationPath);
  } finally { db.close(); }
  return destinationPath;
}

export function restoreDatabase(sourcePath: string, databasePath: string, safetyCopyPath: string, confirmed: boolean): void {
  if (!confirmed) throw new Error('Restore cancelled. Confirm before replacing the current data.');
  if (!fs.existsSync(sourcePath)) throw new Error('The selected backup file could not be found.');
  if (path.resolve(sourcePath) === path.resolve(databasePath)) throw new Error('Choose a backup file, not the current database.');
  createManualBackup(databasePath, safetyCopyPath);
  let source: Database.Database | null = null;
  try {
    source = new Database(sourcePath, { readonly: true, fileMustExist: true });
    // Validate integrity and ensure this is one of our school database backups.
    const check = source.pragma('quick_check') as Array<{ quick_check?: string }>;
    const hasSchoolTable = Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='school_settings'").get());
    if (!Array.isArray(check) || check.some((row) => row.quick_check !== 'ok') || !hasSchoolTable) throw new Error('SQLite integrity check failed.');
    source.close();
    source = null;
  } catch {
    try { source?.close(); } catch { /* already closed or could not be opened */ }
    throw new Error('The selected file is not a valid GDSS Dutse database backup.');
  }
  const target = new Database(databasePath);
  try {
    target.pragma('wal_checkpoint(FULL)');
    target.close();
    // Remove stale WAL sidecars before replacing the database file.
    for (const sidecar of [`${databasePath}-wal`, `${databasePath}-shm`]) { try { fs.rmSync(sidecar, { force: true }); } catch { /* best-effort cleanup */ } }
    fs.copyFileSync(sourcePath, databasePath);
  } catch (error) {
    try { target.close(); } catch { /* already closed */ }
    throw error;
  }
}

export function pruneBackups(directory: string, keep = 14): void {
  if (!fs.existsSync(directory)) return;
  const files = fs.readdirSync(directory)
    .filter((name) => /^gdss-daily-\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .map((name) => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  for (const item of files.slice(Math.max(0, keep))) fs.rmSync(path.join(directory, item.name));
}