'use client';

import { useEffect, useState } from 'react';
import { Svg } from './icons';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'bitacora-theme';

const ICON = {
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
};
const LABEL: Record<ThemeChoice, string> = { system: 'Sistema', light: 'Claro', dark: 'Oscuro' };

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* el modo se mantiene hasta recargar */
  }
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#070B12' : '#111725');
}

/** Estado compartido del tema: se sincroniza entre los selectores de la página. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(read());
    const onChange = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener('bitacora-theme', onChange);
    return () => window.removeEventListener('bitacora-theme', onChange);
  }, []);
  const set = (c: ThemeChoice) => {
    apply(c);
    window.dispatchEvent(new CustomEvent('bitacora-theme', { detail: c }));
  };
  return [choice, set] as const;
}

/** Selector de tres opciones: Sistema, Claro y Oscuro. */
export function ThemeToggle() {
  const [choice, set] = useTheme();
  return (
    <div className="theme-seg" role="group" aria-label="Apariencia">
      {(['system', 'light', 'dark'] as ThemeChoice[]).map((c) => (
        <button key={c} type="button" aria-pressed={choice === c} onClick={() => set(c)}>
          <Svg size={15}>{ICON[c]}</Svg>
          {LABEL[c]}
        </button>
      ))}
    </div>
  );
}

/** Botón compacto para el encabezado del celular: alterna Claro ↔ Oscuro. */
export function ThemeButton() {
  const [choice, set] = useTheme();
  const [sysDark, setSysDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSysDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const isDark = () => choice === 'dark' || (choice === 'system' && sysDark);
  return (
    <button
      type="button"
      className="theme-btn"
      aria-label={isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => set(isDark() ? 'light' : 'dark')}
    >
      <Svg size={18}>{isDark() ? ICON.light : ICON.dark}</Svg>
    </button>
  );
}
