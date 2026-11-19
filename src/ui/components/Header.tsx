import { useEffect, useRef, useState } from 'preact/hooks';
import type { Adr } from '../../core/schema.ts';
import { serializeLedger } from '../../core/markdown.ts';
import { THEMES, type ThemeId } from '../themes.ts';
import { Icon, type Dispatch, type Effects } from './common.tsx';

/** Whether the served file is up to date, and the Autosave switch; null when there is no file to write back to. */
export interface FileStatus {
  readonly state: 'saved' | 'saving' | 'unsaved' | 'error';
  readonly autosave: boolean;
  toggleAutosave(): void;
}

const STATUS_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Not saved' } as const;

/** New, Open, Save and Autosave (when the file can be written back), Download and Share, in a native <details> menu that closes on a pick, Esc or a click elsewhere. */
const FileMenu = ({ adrs, file, dispatch, fx }: { adrs: readonly Adr[]; file: FileStatus | null; dispatch: Dispatch; fx: Effects }) => {
  const menu = useRef<HTMLDetailsElement>(null);
  // The Save › submenu (Autosave): opens on hover, or on click/tap of the chevron.
  const [subOpen, setSubOpen] = useState(false);
  useEffect(() => {
    const close = (e: Event) => {
      const m = menu.current;
      if (m !== null && (e instanceof KeyboardEvent ? e.key === 'Escape' : !m.contains(e.target as Node))) m.open = false;
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  const item = (icon: Parameters<typeof Icon>[0]['name'], label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      class="menu-item"
      onClick={() => {
        if (menu.current !== null) menu.current.open = false;
        run();
      }}
    >
      <Icon name={icon} /> {label}
    </button>
  );
  return (
    <details ref={menu} class="menu" onToggle={() => setSubOpen(false)}>
      <summary class="chrome-link">
        <Icon name="folder" /> File <Icon name="down" size={14} />
        {file !== null ? (
          <span class={`save-status save-${file.state}`} role="status">
            {STATUS_LABEL[file.state]}
          </span>
        ) : null}
      </summary>
      <div class="menu-pop" role="menu">
        {item('plus', 'New ledger…', () => dispatch(adrs.length === 0 ? { type: 'file/new' } : { type: 'file/confirmNew' }))}
        {item('upload', 'Open…', () => dispatch({ type: 'open/show' }))}
        {fx.save !== null && file !== null ? (
          <div class={`menu-split${subOpen ? ' open' : ''}`}>
            {item('save', 'Save', () => fx.save?.(serializeLedger(adrs)))}
            <button type="button" class="menu-item menu-chevron" aria-label="Save options" aria-haspopup="menu" aria-expanded={subOpen} onClick={() => setSubOpen(!subOpen)}>
              <Icon name="forward" size={16} />
            </button>
            <div class="menu-pop menu-sub" role="menu">
              <button type="button" role="menuitemcheckbox" aria-checked={file.autosave} class="menu-item" onClick={file.toggleAutosave}>
                <Icon name={file.autosave ? 'check' : 'minus'} /> Autosave
              </button>
            </div>
          </div>
        ) : null}
        {item('download', 'Download decisions.md', () => fx.download('decisions.md', serializeLedger(adrs)))}
        {item('copy', 'Copy share link', () => fx.share(serializeLedger(adrs)))}
        {item('edit', 'Design card…', () => dispatch({ type: 'nav/card' }))}
      </div>
    </details>
  );
};

export const Header = ({ theme, todayLabel, onNew, adrs, file, dispatch, fx }: { theme: ThemeId; todayLabel: string; onNew: () => void; adrs: readonly Adr[]; file: FileStatus | null; dispatch: Dispatch; fx: Effects }) => (
  <header class="chrome">
    <div class="wrap chrome-row">
      <button type="button" class="brand" onClick={() => dispatch({ type: 'nav/dashboard' })}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="26" height="26" rx="4" stroke="currentColor" stroke-width="1.5" />
          <path d="M1 10h26M1 19h26M10 1v26M19 1v26" stroke="currentColor" stroke-opacity="0.45" />
          <rect x="19.5" y="10.5" width="7" height="8" style={{ fill: 'var(--mark)' }} />
        </svg>
        <span class="brand-name">Decision Ledger</span>
        <span class="brand-tag">ADR</span>
      </button>
      <nav class="chrome-nav" aria-label="Main">
        <div class="theme-picker" role="group" aria-label="Theme">
          <span class="theme-label">Theme</span>
          {THEMES.map((t) => {
            const on = t.id === theme;
            return (
              <button key={t.id} type="button" class={`theme-btn${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${t.label} theme`} title={t.label} onClick={() => dispatch({ type: 'theme/set', theme: t.id })}>
                <span class="theme-swatch" aria-hidden="true" style={{ background: t.swatch.bg }}>
                  <span style={{ background: t.swatch.primary }} />
                  <i style={{ background: t.swatch.accent }} />
                </span>
                {on ? <span>{t.label}</span> : null}
              </button>
            );
          })}
        </div>
        <span class="chrome-muted mono small">Today · {todayLabel}</span>
        <button type="button" class="chrome-link" onClick={() => dispatch({ type: 'nav/dashboard' })}>
          All decisions
        </button>
        <FileMenu adrs={adrs} file={file} dispatch={dispatch} fx={fx} />
        <button type="button" class="chrome-link" onClick={() => dispatch({ type: 'nav/markdown', focusId: null })}>
          <Icon name="code" /> Markdown
        </button>
        <button type="button" class="btn btn-invert" onClick={onNew}>
          <Icon name="plus" /> New ADR
        </button>
      </nav>
    </div>
  </header>
);
