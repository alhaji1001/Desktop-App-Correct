import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const appSource = fs.readFileSync(path.resolve(__dirname, '../src/ui/App.tsx'), 'utf8');
const cssSource = fs.readFileSync(path.resolve(__dirname, '../src/ui/style.css'), 'utf8');

describe('desktop shell', () => {
  it('defines the seven requested navigation pages', () => {
    for (const label of ['Dashboard', 'Classes & Subjects', 'Students', 'Scores', 'Results & Reports', 'Settings', 'Backup & Data']) {
      expect(appSource).toContain(label);
    }
  });
  it('includes four first-run setup screens and Ctrl+F search shortcut', () => {
    expect(appSource).toContain('School details');
    expect(appSource).toContain('Session & term');
    expect(appSource).toContain('Add classes');
    expect(appSource).toContain('Ready to begin');
    expect(appSource).toContain("event.key.toLowerCase() === 'f'");
  });
  it('uses the Android navy theme and responsive desktop layout', () => {
    expect(cssSource).toContain('#0b1f4b');
    expect(cssSource).toContain('#07163a');
    expect(cssSource).toContain('#d9ad45');
    expect(cssSource).toContain('@media (max-width: 1050px)');
  });
});