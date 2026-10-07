import type { ReactNode } from 'react';

export function Svg({ children, size = 16, w = 2 }: { children: ReactNode; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const I = {
  check: <path d="M4 12.5l5 5L20 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 01-3.4 0" />
    </>
  ),
  cal: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4" />
      <path d="M21 13v2a3 3 0 01-3 3H3" />
    </>
  ),
  note: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  logout: (
    <>
      <path d="M15 4h4v16h-4" />
      <path d="M10 8l-4 4 4 4M6 12h11" />
    </>
  ),
  hoy: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  proximas: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  historial: (
    <>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8" />
      <path d="M3 3v5h5M12 8v4l3 2" />
    </>
  ),
  bitacora: (
    <>
      <path d="M6 3h10l3 3v15H6z" />
      <path d="M10 9h6M10 13h6M10 17h4M6 3v18" />
    </>
  ),
};

export const PALETTE: [string, string, string][] = [
  ['#E07A2E', '#FBE9DC', '#8A3F0B'],
  ['#4C7BE0', '#E1E9FB', '#2445A0'],
  ['#2FA37A', '#DDF3EA', '#19694C'],
  ['#A36BD8', '#EFE3FA', '#6A3A9C'],
  ['#C9A227', '#F7EFCF', '#6E5A0E'],
  ['#D2557A', '#FBE1E9', '#8C2547'],
  ['#3A9DB5', '#DCF0F5', '#1D5F70'],
  ['#7B8A3A', '#EEF1DC', '#4A5520'],
  ['#8B6B4A', '#F1E8DE', '#5A4128'],
  ['#5E6B80', '#E6E9EE', '#384252'],
];

export const COLOR_NAMES = ['Naranjo', 'Azul', 'Verde', 'Morado', 'Mostaza', 'Rosa', 'Celeste', 'Oliva', 'Café', 'Gris'];
