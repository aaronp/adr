import { useEffect, useRef, useState } from 'preact/hooks';
import type { Adr } from '../../core/schema.ts';
import { serializeLedger } from '../../core/markdown.ts';
import { THEMES, type ThemeId } from '../themes.ts';
import { Icon, type Dispatch, type Effects } from './common.tsx';

/** New, Open, Download and Share, in a native <details> menu that closes on a pick, Esc or a click elsewhere. */
const FileMenu = ({ adrs, badge, dispatch, fx }: { adrs: readonly Adr[]; badge: () => string; dispatch: Dispatch; fx: Effects }) => {
  const menu = useRef<HTMLDetailsElement>(null);
  /* Drawn when the menu opens, so it picks up the theme's colours as they are now. */
  const [preview, setPreview] = useState('');
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
    <details ref={menu} class="menu" onToggle={(e) => setPreview(e.currentTarget.open ? badge() : '')}>
      <summary class="chrome-link">
        <Icon name="folder" /> File <Icon name="down" size={14} />
      </summary>
      <div class="menu-pop" role="menu">
        {item('plus', 'New ledger…', () => dispatch(adrs.length === 0 ? { type: 'file/new' } : { type: 'file/confirmNew' }))}
        {item('upload', 'Open…', () => dispatch({ type: 'open/show' }))}
        {item('download', 'Download decisions.md', () => fx.download('decisions.md', serializeLedger(adrs)))}
        {item('copy', 'Copy share link', () => fx.share(serializeLedger(adrs)))}
        <span class="menu-heading">Status badge (SVG)</span>
        {preview === '' ? null : <img class="menu-badge" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} alt="" />}
        {item('copy', 'Copy badge', () => fx.copy(badge(), 'Badge SVG'))}
        {item('download', 'Download badge.svg', () => fx.download('decisions-badge.svg', badge(), 'image/svg+xml'))}
      </div>
    </details>
  );
};

export const Header = ({ theme, todayLabel, onNew, adrs, badge, dispatch, fx }: { theme: ThemeId; todayLabel: string; onNew: () => void; adrs: readonly Adr[]; badge: () => string; dispatch: Dispatch; fx: Effects }) => (
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
        <FileMenu adrs={adrs} badge={badge} dispatch={dispatch} fx={fx} />
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
