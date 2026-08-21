type UserIdentifierKind = 'EMAIL' | 'GMAIL' | 'HANDLE' | 'NAME';

type UserIdentifierInput = {
  email?: string | null;
  handle?: string | null;
  name?: string | null;
};

const normalizeIdentifierValue = (value: string): string => {
  const trimmed = value.trim().toLowerCase().replace(/^@+/, '');
  if (!trimmed) return '';

  if (trimmed.includes('@')) {
    return trimmed.replace(/\+[^@]+@/, '@').replace(/\s+/g, '');
  }

  return trimmed.replace(/[^a-z0-9_\-]/g, '');
};

const userIdentifierEntries = (input: UserIdentifierInput) => {
  const entries: Array<{ kind: UserIdentifierKind; value: string }> = [];
  const seen = new Set<string>();

  const add = (kind: UserIdentifierKind, rawValue: string | null | undefined) => {
    if (!rawValue) return;
    const value = normalizeIdentifierValue(rawValue);
    if (!value || seen.has(value)) return;
    seen.add(value);
    entries.push({ kind, value });
  };

  const addRaw = (kind: UserIdentifierKind, rawValue: string | null | undefined) => {
    if (!rawValue) return;
    const value = rawValue.trim().toLowerCase();
    if (!value || seen.has(value)) return;
    seen.add(value);
    entries.push({ kind, value });
  };

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    addRaw('EMAIL', email);
    add('EMAIL', email);
    add('GMAIL', email.replace(/\+[^@]+@/, '@'));

    const [localPart, domain] = email.split('@');
    if (localPart && domain) {
      addRaw('EMAIL', localPart);
      add('EMAIL', localPart);
      addRaw('EMAIL', `${localPart}@${domain}`);
      add('EMAIL', `${localPart.replace(/\./g, '')}@${domain}`);
    }
  }

  if (input.handle) {
    const handle = input.handle.trim().replace(/^@+/, '').toLowerCase();
    addRaw('HANDLE', handle);
    add('HANDLE', handle);
    add('HANDLE', handle.replace(/[^a-z0-9_\-]/g, ''));
  }

  if (input.name) {
    const name = input.name.trim().toLowerCase();
    addRaw('NAME', name);
    add('NAME', name);
    addRaw('NAME', name.replace(/\s+/g, ' '));
    add('NAME', name.replace(/\s+/g, ''));
  }

  return entries;
};

const buildLookupValues = (input: UserIdentifierInput) => {
  const values = new Set<string>();
  for (const entry of userIdentifierEntries(input)) values.add(entry.value);
  for (const raw of [input.email, input.handle, input.name]) {
    if (!raw) continue;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed) values.add(trimmed);
    const localPart = raw.includes('@') ? raw.split('@')[0] : null;
    if (localPart) values.add(localPart.trim().toLowerCase());
  }
  return [...values].filter(Boolean);
};

export { buildLookupValues, normalizeIdentifierValue, userIdentifierEntries };
