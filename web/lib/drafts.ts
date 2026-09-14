const memory: Record<string, string> = {};

export function readDraft(scope: string): string {
  const key = `leadloom-draft:${scope}`;
  if (Object.hasOwn(memory, key)) return memory[key];
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function writeDraft(scope: string, body: string): boolean {
  const key = `leadloom-draft:${scope}`;
  memory[key] = body;
  try {
    if (body) sessionStorage.setItem(key, body);
    else sessionStorage.removeItem(key);
    return true;
  } catch {
    // ponytail: memory fallback lasts until reload when browser storage is unavailable.
    return false;
  }
}
