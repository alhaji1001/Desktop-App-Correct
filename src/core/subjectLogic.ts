export function normalizeSubjectName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function hasDuplicateSubjectName(names: string[], candidate: string, exceptName?: string): boolean {
  const normalized = normalizeSubjectName(candidate);
  if (!normalized) return false;
  const except = exceptName === undefined ? null : normalizeSubjectName(exceptName);
  return names.some((name) => normalizeSubjectName(name) === normalized && normalizeSubjectName(name) !== except);
}

/** Returns source subject names absent from the target, ignoring case and surrounding spaces. */
export function getSubjectsToCopy(sourceNames: string[], targetNames: string[]): string[] {
  const seen = new Set(targetNames.map(normalizeSubjectName));
  const additions: string[] = [];
  for (const rawName of sourceNames) {
    const name = rawName.trim();
    const normalized = normalizeSubjectName(name);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    additions.push(name);
  }
  return additions;
}
