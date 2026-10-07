// Utilidades de fecha en la hora local del dispositivo.
const DAY = 864e5;
export const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export const todayISO = () => iso(startOfToday());

export const parseISO = (s: string) => new Date(`${s}T00:00:00`);

/** Días desde hoy hasta la fecha (negativo = pasado). */
export const diff = (s: string) => Math.round((parseISO(s).getTime() - startOfToday().getTime()) / DAY);

export const addDays = (n: number) => iso(new Date(startOfToday().getTime() + n * DAY));

/** Fecha local (YYYY-MM-DD) de un timestamp ISO. */
export const localDay = (ts: string) => iso(new Date(ts));

/** Hora local HH:MM de un timestamp ISO. */
export const localTime = (ts: string) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function fmtDue(s: string) {
  const d = diff(s);
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d === -1) return 'Ayer';
  if (d < 0) return `Hace ${-d} días`;
  return parseISO(s).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const longDate = (s: string) =>
  parseISO(s).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

export function nextDate(s: string, rec: 'd' | 'w' | 'm') {
  const d = parseISO(s);
  if (rec === 'd') {
    do d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6);
  } else if (rec === 'w') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return iso(d);
}

/** Lunes a domingo de la semana actual. */
export function weekDays() {
  const base = startOfToday();
  const wd = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - wd);
  return Array.from({ length: 7 }, (_, i) => new Date(base.getTime() + i * DAY));
}
