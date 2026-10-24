import type { ComponentChildren } from 'preact';
import type { Person, Status } from '../../core/schema.ts';
import type { RevisitInfo } from '../../core/dates.ts';
import type { Action } from '../state.ts';

export type Dispatch = (a: Action) => void;

/** Side effects the UI can request. Implemented in main.tsx; each reports its own failures. */
export interface Effects {
  copy(text: string, what: string): void;
  download(fileName: string, text: string): void;
  openFile(file: File): void;
  /** Fetches a URL and loads it; rejects with a message to show, so the caller can keep its dialog open. */
  openUrl(url: string): Promise<void>;
}

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  back: 'M15 18l-6-6 6-6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5'
} as const;
export type IconName = keyof typeof ICONS;

export const Icon = ({ name, size = 16 }: { name: IconName; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

const STATUS_LABEL: Record<Status, string> = {
  proposed: 'Proposed',
  accepted: 'Accepted',
  superseded: 'Superseded',
  deprecated: 'Deprecated',
  rejected: 'Rejected'
};
export const statusLabel = (s: Status): string => STATUS_LABEL[s];

export const StatusPill = ({ status, large = false }: { status: Status; large?: boolean }) => (
  <span class={`pill status-${status}${large ? ' pill-lg' : ''}`}>
    <span class="pill-dot" aria-hidden="true" />
    {STATUS_LABEL[status]}
  </span>
);

export const RevisitBadge = ({ info, long = false }: { info: RevisitInfo; long?: boolean }) => (
  <span class={`badge revisit-${info.kind}`}>{long ? info.label : info.short}</span>
);

const AVATAR_COLORS = ['#2E5BDA', '#0E8576', '#8A4FD0', '#B5501F', '#7A5A00', '#A3283C'] as const;

export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter((x) => x !== '');
  const first = parts[0];
  if (first === undefined) return '?';
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  return (first.charAt(0) + (last === undefined ? '' : last.charAt(0))).toUpperCase();
};

/** Deterministic colour from the name, so a person keeps their colour across records. */
export const avatarColor = (name: string): string => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = AVATAR_COLORS[h % AVATAR_COLORS.length];
  if (c === undefined) throw new Error('bug: avatar colour index out of range');
  return c;
};

export const Avatar = ({ person, size = 32, ring = false }: { person: Pick<Person, 'name'>; size?: number; ring?: boolean }) => (
  <span class={`avatar${ring ? ' avatar-ring' : ''}`} title={person.name} style={{ width: size, height: size, background: avatarColor(person.name) }} aria-hidden="true">
    {initials(person.name)}
  </span>
);

export const Kicker = ({ children, as = 'span', id }: { children: ComponentChildren; as?: 'span' | 'h2'; id?: string }) =>
  as === 'h2' ? (
    <h2 class="kicker" id={id}>
      {children}
    </h2>
  ) : (
    <span class="kicker" id={id}>
      {children}
    </span>
  );

export const Swatch = ({ color, size = 10 }: { color: string; size?: number }) => (
  <span class="swatch" aria-hidden="true" style={{ width: size, height: size, background: color }} />
);

/** Five dots; filled up to the score. null = all hollow. */
export const Dots = ({ value, color, size = 10 }: { value: number | null; color: string; size?: number }) => (
  <span class="dots" role="img" aria-label={value === null ? 'Unscored' : `Score ${value} of 5`}>
    {[1, 2, 3, 4, 5].map((k) => (
      <span
        key={k}
        class="dot"
        style={{ width: size, height: size, background: value !== null && k <= value ? color : 'transparent', borderColor: value !== null && k <= value ? color : 'var(--control-border)' }}
      />
    ))}
  </span>
);
