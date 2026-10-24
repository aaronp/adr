/**
 * Browser side effects, kept at the edge. Each function either succeeds or throws/rejects with a
 * message fit to show the user — callers surface failures as a toast; nothing fails silently.
 */

export const STORAGE_KEYS = {
  markdown: 'decision-ledger:markdown:v1',
  theme: 'decision-ledger:theme:v1'
} as const;

/** Storage can be unavailable (private mode, blocked site data). That is reported, not hidden. */
export interface Store {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export const createBrowserStore = (): { store: Store; available: true } | { store: null; available: false; reason: string } => {
  try {
    const ls = window.localStorage;
    const probe = 'decision-ledger:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      available: true,
      store: {
        read: (key) => ls.getItem(key),
        write: (key, value) => ls.setItem(key, value)
      }
    };
  } catch (e) {
    return { store: null, available: false, reason: e instanceof Error ? e.message : String(e) };
  }
};

export const copyText = async (text: string): Promise<void> => {
  if (navigator.clipboard === undefined || typeof navigator.clipboard.writeText !== 'function') {
    throw new Error('Clipboard is not available here — select the text and copy it manually.');
  }
  await navigator.clipboard.writeText(text);
};

export const downloadText = (fileName: string, text: string, mime = 'text/markdown;charset=utf-8'): void => {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const readTextFile = async (file: File): Promise<string> => {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error(`"${file.name}" is not a markdown file (.md).`);
  return file.text();
};

/** Fetches a markdown file from a URL (absolute, or relative to the page). Sources on another host must allow CORS. */
export const fetchText = async (raw: string): Promise<{ url: string; markdown: string }> => {
  const url = new URL(raw, location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { url: url.href, markdown: await res.text() };
};
