import { THEMES, type ThemeId } from '../themes.ts';
import { Icon, type Dispatch } from './common.tsx';

export const Header = ({ theme, todayLabel, onNew, dispatch }: { theme: ThemeId; todayLabel: string; onNew: () => void; dispatch: Dispatch }) => (
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
        <button type="button" class="chrome-link" onClick={() => dispatch({ type: 'open/show' })}>
          <Icon name="folder" /> Open
        </button>
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
