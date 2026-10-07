'use client';

import { useMemo, useState } from 'react';
import type { Tag, Task } from '@/lib/types';
import { diff, iso, localDay, localTime, longDate, parseISO, todayISO } from '@/lib/dates';
import { I, PALETTE, Svg } from './icons';

interface Props {
  tasks: Task[];
  tags: Tag[];
  notes: Record<string, string>;
  query: string;
  onNote: (day: string, body: string) => void;
  onOpenTask: (t: Task) => void;
  onToast: (m: string) => void;
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

/** Bitácora: elige un día y ve qué hiciste, qué quedó pendiente y tus apuntes. */
export function DailyLog({ tasks, tags, notes, query, onNote, onOpenTask, onToast }: Props) {
  const TODAY = todayISO();
  const [day, setDay] = useState(TODAY);
  const [cursor, setCursor] = useState(() => {
    const d = parseISO(TODAY);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const tagOf = (id: string | null) => tags.find((t) => t.id === id);

  // Actividad por día: completadas y apuntes, para marcar el calendario.
  const activity = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) if (t.done_at) map.set(localDay(t.done_at), (map.get(localDay(t.done_at)) ?? 0) + 1);
    return map;
  }, [tasks]);

  const done = tasks.filter((t) => t.done_at && localDay(t.done_at) === day).sort((a, b) => a.done_at!.localeCompare(b.done_at!));
  const dueOpen = tasks.filter((t) => t.due_date === day && (!t.done_at || localDay(t.done_at) > day));
  const created = tasks.filter((t) => localDay(t.created_at) === day);
  const note = notes[day] ?? '';
  const isPast = day < TODAY;

  // Grilla del mes (lunes primero)
  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(cursor.y, cursor.m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const monthName = cap(first.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }));

  const moveMonth = (n: number) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const pick = (d: string) => {
    setDay(d);
    const p = parseISO(d);
    setCursor({ y: p.getFullYear(), m: p.getMonth() });
  };

  function summaryText() {
    const lines = [`Bitácora · ${longDate(day)}`, ''];
    lines.push(`Completadas (${done.length}):`);
    lines.push(...(done.length ? done.map((t) => `- ${localTime(t.done_at!)} ${t.title}${tagOf(t.tag_id) ? ` [${tagOf(t.tag_id)!.name}]` : ''}`) : ['- Ninguna']));
    if (dueOpen.length) {
      lines.push('', `${isPast ? 'Quedaron pendientes' : 'Pendientes'} (${dueOpen.length}):`);
      lines.push(...dueOpen.map((t) => `- ${t.title}`));
    }
    if (note.trim()) lines.push('', 'Apuntes:', note.trim());
    return lines.join('\n');
  }

  async function copy() {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
      onToast('Resumen copiado. Pégalo en un correo o informe.');
    } catch {
      onToast('No se pudo copiar. Selecciona el texto manualmente.');
    }
  }

  // Búsqueda en apuntes de todos los días
  const q = query.trim().toLowerCase();
  const matches = q
    ? Object.keys(notes)
        .filter((k) => notes[k].toLowerCase().includes(q))
        .sort()
        .reverse()
    : [];

  const row = (t: Task, right: React.ReactNode) => {
    const tag = tagOf(t.tag_id);
    return (
      <button key={t.id} type="button" className="log-row" onClick={() => onOpenTask(t)}>
        <span className="log-dot" style={{ background: tag ? PALETTE[tag.color % 10][0] : 'var(--line-2)' }} aria-hidden="true" />
        <span className="log-title">{t.title}</span>
        {tag && <span className="log-tag">{tag.name}</span>}
        <span className="log-right">{right}</span>
      </button>
    );
  };

  return (
    <div className="dlog">
      {q && (
        <section className="card">
          <h3>Apuntes que contienen “{query.trim()}”</h3>
          {matches.length ? (
            matches.map((k) => (
              <button key={k} type="button" className="log-row" onClick={() => pick(k)}>
                <span className="log-title">{longDate(k)}</span>
                <span className="log-right">Ver día</span>
              </button>
            ))
          ) : (
            <p className="note">Ningún apunte coincide con tu búsqueda.</p>
          )}
        </section>
      )}

      <div className="dlog-grid">
        <section className="card mcal-card" aria-label="Calendario">
          <div className="mcal-head">
            <button type="button" className="icon-btn" onClick={() => moveMonth(-1)} aria-label="Mes anterior"><Svg size={18}>{I.left}</Svg></button>
            <b>{monthName}</b>
            <button type="button" className="icon-btn" onClick={() => moveMonth(1)} aria-label="Mes siguiente"><Svg size={18}>{I.right}</Svg></button>
          </div>
          <div className="mcal-grid">
            {WEEKDAYS.map((w) => <span key={w} className="mcal-wd">{w}</span>)}
            {cells.map((d, i) =>
              d ? (
                <button
                  key={d}
                  type="button"
                  className={`mcal-day ${d === TODAY ? 'is-today' : ''} ${d > TODAY ? 'future' : ''}`}
                  aria-pressed={d === day}
                  aria-label={`${longDate(d)}${activity.get(d) ? `, ${activity.get(d)} completadas` : ''}${notes[d]?.trim() ? ', con apuntes' : ''}`}
                  onClick={() => pick(d)}
                >
                  {Number(d.slice(8))}
                  <span className="mcal-marks">
                    {activity.get(d) ? <i className="m-done" /> : null}
                    {notes[d]?.trim() ? <i className="m-note" /> : null}
                  </span>
                </button>
              ) : (
                <span key={`e${i}`} />
              )
            )}
          </div>
          <div className="mcal-legend">
            <span><i className="m-done" /> Tareas completadas</span>
            <span><i className="m-note" /> Con apuntes</span>
          </div>
          {day !== TODAY && (
            <button type="button" className="btn sm" style={{ marginTop: 12, width: '100%' }} onClick={() => pick(TODAY)}>Volver a hoy</button>
          )}
        </section>

        <section className="card day-card">
          <div className="day-head">
            <div>
              <h3 style={{ margin: 0 }}>{day === TODAY ? 'Hoy' : cap(longDate(day))}</h3>
              <p className="note" style={{ margin: '2px 0 0' }}>
                {day === TODAY ? longDate(day) : diff(day) < 0 ? `Hace ${-diff(day)} día${diff(day) === -1 ? '' : 's'}` : 'Día futuro'}
              </p>
            </div>
            <button type="button" className="btn sm" onClick={copy}><Svg size={15}>{I.copy}</Svg>Copiar resumen</button>
          </div>

          <div className="day-stats">
            <div><b>{done.length}</b><span>completadas</span></div>
            <div className={dueOpen.length && isPast ? 'late' : ''}><b>{dueOpen.length}</b><span>{isPast ? 'quedaron pendientes' : 'pendientes'}</span></div>
            <div><b>{created.length}</b><span>creadas</span></div>
          </div>

          <div className="log-sec">
            <h4>Completadas</h4>
            {done.length ? done.map((t) => row(t, localTime(t.done_at!))) : <p className="note">Ninguna tarea completada este día.</p>}
          </div>
          {dueOpen.length > 0 && (
            <div className="log-sec">
              <h4>{isPast ? 'Vencían este día y quedaron pendientes' : 'Pendientes para este día'}</h4>
              {dueOpen.map((t) => row(t, t.done_at ? `hecha el ${localDay(t.done_at).slice(8, 10)}/${localDay(t.done_at).slice(5, 7)}` : 'pendiente'))}
            </div>
          )}

          <div className="log-sec">
            <h4><label htmlFor="dayNote">Apuntes del día</label></h4>
            <textarea
              id="dayNote"
              className="ruled"
              placeholder="¿Qué pasó hoy? Acuerdos, llamadas, cosas por recordar…"
              value={note}
              onChange={(e) => onNote(day, e.target.value)}
            />
            <p className="note" style={{ margin: '6px 0 0' }}>Se guarda solo. Puedes escribir o corregir los apuntes de cualquier día.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
