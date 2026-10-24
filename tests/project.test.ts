import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('desktop project skeleton', () => {
  it('has the required product identity', () => {
    expect(packageJson.name).toBe('gdss-dutse-results');
    expect(packageJson.version).toBe('1.0.0');
    expect(packageJson.build.appId).toBe('com.gdss.dutse.desktop');
    expect(packageJson.build.artifactName).toBe('${productName} Setup ${version}.${ext}');
    expect(packageJson.build.productName).toBe('GDSS Dutse Results');
  });

  it('configures a user-selectable installer and preserves app data', () => {
    expect(packageJson.build.nsis.oneClick).toBe(false);
    expect(packageJson.build.nsis.allowToChangeInstallationDirectory).toBe(true);
    expect(packageJson.build.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(packageJson.build.win.icon).toBe('build/icon.ico');
    expect(packageJson.build.files).toContain('package.json');
  });
});
import fs from 'node:fs';
import path from 'node:path';

describe('release data safety and core workflows', () => {
  const mainSource = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf8');
  const preloadSource = fs.readFileSync(path.resolve(__dirname, '../electron/preload.ts'), 'utf8');
  const appSource = fs.readFileSync(path.resolve(__dirname, '../src/ui/App.tsx'), 'utf8');
  it('keeps the same stable userData database path across app versions', () => {
    expect(mainSource).toContain("const dataDirectory = app.getPath('userData')");
    expect(mainSource).toContain("path.join(dataDirectory, 'gdss-dutse-results.db')");
    expect(packageJson.build.appId).toBe('com.gdss.dutse.desktop');
    expect(packageJson.build.nsis.deleteAppDataOnUninstall).toBe(false);
  });
  it('exposes real setup, dashboard and backup/restore handlers', () => {
    for (const handler of ["'setup:complete'", "'dashboard:get'", "'backup:create'", "'backup:restore'"]) expect(mainSource).toContain(handler);
    for (const method of ['setupComplete', 'dashboardGet', 'backupCreate', 'backupRestore']) expect(preloadSource).toContain(method);
    expect(appSource).toContain('function BackupDataPage');
    expect(appSource).toContain('window.desktop.dashboardGet()');
    expect(appSource).toContain('window.desktop.setupComplete(');
  });
});
