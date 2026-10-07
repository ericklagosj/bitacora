'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings, Tag, Task } from '@/lib/types';
import { diff, iso, localDay, longDate, startOfToday, todayISO } from '@/lib/dates';
import { I, PALETTE, Svg } from './icons';
import { PushCard } from './PushCard';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  supabase: SupabaseClient;
  email: string;
  memberSince: string;
  settings: Settings | null;
  tasks: Task[];
  tags: Tag[];
  notes: Record<string, string>;
  streak: number;
  onSettings: (p: Partial<Settings>) => void;
  onToast: (m: string) => void;
  onLogout: () => void;
}

const WEEKS = 12;
const DOW = ['Lun', '', 'Mié', '', 'Vie', '', ''];

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ProfileView({ supabase, email, memberSince, settings, tasks, tags, notes, streak, onSettings, onToast, onLogout }: Props) {
  const [name, setName] = useState(settings?.display_name ?? '');
  const TODAY = todayISO();
  const display = (settings?.display_name || email.split('@')[0] || 'Tú').trim();
  const initials = display
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.done_at);
    const monthPrefix = TODAY.slice(0, 7);
    const onTime = done.filter((t) => localDay(t.done_at!) <= t.due_date).length;
    const activeDays = new Set(done.map((t) => localDay(t.done_at!))).size;
    return {
      total: done.length,
      month: done.filter((t) => localDay(t.done_at!).startsWith(monthPrefix)).length,
      week: done.filter((t) => diff(localDay(t.done_at!)) > -7).length,
      onTimePct: done.length ? Math.round((onTime / done.length) * 100) : null,
      pending: tasks.filter((t) => !t.done_at).length,
      late: tasks.filter((t) => !t.done_at && diff(t.due_date) < 0).length,
      perDay: activeDays ? (done.length / activeDays).toFixed(1).replace('.', ',') : '0',
      notesCount: Object.values(notes).filter((n) => n.trim()).length,
    };
  }, [tasks, notes, TODAY]);

  // Mapa de actividad: 12 semanas, columnas = semanas, filas = lunes a domingo
  const heat = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) if (t.done_at) counts.set(localDay(t.done_at), (counts.get(localDay(t.done_at)) ?? 0) + 1);
    const today = startOfToday();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const cols = Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + w * 7 + d);
        const key = iso(dt);
        return { key, n: counts.get(key) ?? 0, future: key > TODAY };
      })
    );
    const max = Math.max(1, ...cols.flat().map((c) => c.n));
    return { cols, max };
  }, [tasks, TODAY]);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / heat.max) * 4)));

  const byTag = useMemo(() => {
    const rows = tags.map((t) => ({
      tag: t,
      done: tasks.filter((x) => x.tag_id === t.id && x.done_at).length,
      open: tasks.filter((x) => x.tag_id === t.id && !x.done_at).length,
    }));
    const none = { done: tasks.filter((x) => !x.tag_id && x.done_at).length, open: tasks.filter((x) => !x.tag_id && !x.done_at).length };
    const max = Math.max(1, ...rows.map((r) => r.done + r.open), none.done + none.open);
    return { rows: rows.sort((a, b) => b.done + b.open - (a.done + a.open)), none, max };
  }, [tags, tasks]);

  function exportJSON() {
    const data = {
      exportado: new Date().toISOString(),
      cuenta: email,
      etiquetas: tags.map(({ name, color, position }) => ({ name, color, position })),
      tareas: tasks.map((t) => ({
        folio: t.folio, titulo: t.title, notas: t.notes, etiqueta: tags.find((x) => x.id === t.tag_id)?.name ?? null,
        fecha: t.due_date, prioridad_alta: t.priority, repetir: t.repeat, avisar_tras_dias: t.remind_after_days,
        completada: t.done_at, creada: t.created_at, subtareas: t.subtasks.map((s) => ({ titulo: s.title, hecha: s.done })),
      })),
      bitacora: Object.entries(notes).filter(([, v]) => v.trim()).sort().map(([dia, texto]) => ({ dia, texto })),
    };
    download(`bitacora-respaldo-${TODAY}.json`, JSON.stringify(data, null, 2), 'application/json');
    onToast('Respaldo descargado');
  }

  function exportCSV() {
    const head = ['Folio', 'Título', 'Etiqueta', 'Fecha', 'Prioridad alta', 'Estado', 'Completada', 'Notas'];
    const rows = [...tasks]
      .sort((a, b) => a.folio - b.folio)
      .map((t) => [
        t.folio, t.title, tags.find((x) => x.id === t.tag_id)?.name ?? '', t.due_date, t.priority ? 'Sí' : 'No',
        t.done_at ? 'Completada' : diff(t.due_date) < 0 ? 'Atrasada' : 'Pendiente',
        t.done_at ? new Date(t.done_at).toLocaleString('es-CL') : '', t.notes,
      ]);
    // BOM + punto y coma para que Excel en español lo abra con columnas correctas
    const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\n');
    download(`bitacora-tareas-${TODAY}.csv`, csv, 'text/csv;charset=utf-8');
    onToast('Planilla de tareas descargada');
  }

  const since = memberSince ? longDate(localDay(memberSince)) : '';

  return (
    <div className="profile">
      <section className="card prof-head">
        <div className="avatar" aria-hidden="true">{initials || '·'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: 0 }}>{display}</h3>
          <p className="note" style={{ margin: '2px 0 0', overflowWrap: 'anywhere' }}>{email}</p>
          {since && <p className="note" style={{ margin: '2px 0 0' }}>Usando Bitácora desde el {since}</p>}
        </div>
      </section>

      <section className="card">
        <h3>Tus números</h3>
        <div className="kpis">
          <div><b>{stats.total}</b><span>tareas completadas</span></div>
          <div><b>{stats.month}</b><span>este mes</span></div>
          <div><b>{stats.week}</b><span>últimos 7 días</span></div>
          <div><b>{stats.onTimePct == null ? '—' : `${stats.onTimePct}%`}</b><span>completadas a tiempo</span></div>
          <div><b>{streak}</b><span>días hábiles al día</span></div>
          <div className={stats.late ? 'late' : ''}><b>{stats.pending}</b><span>pendientes{stats.late ? `, ${stats.late} atrasada${stats.late === 1 ? '' : 's'}` : ''}</span></div>
          <div><b>{stats.perDay}</b><span>completadas por día activo</span></div>
          <div><b>{stats.notesCount}</b><span>días con apuntes</span></div>
        </div>
      </section>

      <section className="card">
        <h3>Actividad <small>últimas {WEEKS} semanas</small></h3>
        <div className="heat-wrap">
          <div className="heat" role="img" aria-label={`Tareas completadas por día en las últimas ${WEEKS} semanas`}>
            <div className="heat-dow">{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
            {heat.cols.map((col, w) => (
              <div key={w} className="heat-col">
                {col.map((c) => (
                  <span
                    key={c.key}
                    className={`heat-cell l${c.future ? 'x' : level(c.n)}`}
                    title={c.future ? '' : `${longDate(c.key)}: ${c.n} completada${c.n === 1 ? '' : 's'}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="heat-legend" aria-hidden="true">
            Menos <i className="heat-cell l0" /><i className="heat-cell l1" /><i className="heat-cell l2" /><i className="heat-cell l3" /><i className="heat-cell l4" /> Más
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Por etiqueta</h3>
        {byTag.rows.length === 0 && !byTag.none.done && !byTag.none.open ? (
          <p className="note">Aún no hay tareas.</p>
        ) : (
          <div className="tagbars">
            {[...byTag.rows.map((r) => ({ key: r.tag.id, name: r.tag.name, color: PALETTE[r.tag.color % 10][0], done: r.done, open: r.open })),
              ...(byTag.none.done + byTag.none.open ? [{ key: 'none', name: 'Sin etiqueta', color: 'var(--line-2)', done: byTag.none.done, open: byTag.none.open }] : [])]
              .map((r) => (
                <div key={r.key} className="tagbar">
                  <span className="tagbar-name"><span className="folder" style={{ background: r.color }} />{r.name}</span>
                  <span className="tagbar-track" aria-hidden="true">
                    <i className="tb-done" style={{ width: `${(r.done / byTag.max) * 100}%` }} />
                    <i className="tb-open" style={{ width: `${(r.open / byTag.max) * 100}%` }} />
                  </span>
                  <span className="tagbar-num">{r.done} hecha{r.done === 1 ? '' : 's'} · {r.open} pendiente{r.open === 1 ? '' : 's'}</span>
                </div>
              ))}
            <div className="heat-legend" aria-hidden="true"><i className="tb-done sw" /> Hechas <i className="tb-open sw" /> Pendientes</div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Ajustes</h3>
        <form
          className="field"
          onSubmit={(e) => {
            e.preventDefault();
            onSettings({ display_name: name.trim() || null });
            onToast('Nombre guardado');
          }}
        >
          <label htmlFor="pName">Tu nombre</label>
          <div className="addsub">
            <input id="pName" maxLength={60} placeholder="Cómo quieres que te salude" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn sm" type="submit">Guardar</button>
          </div>
        </form>
        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="pThr">Avisar de tareas atrasadas después de</label>
          <select id="pThr" value={settings?.remind_after_days ?? 3} onChange={(e) => onSettings({ remind_after_days: Number(e.target.value) })}>
            <option value={1}>1 día</option>
            <option value={3}>3 días</option>
            <option value={5}>5 días</option>
            <option value={7}>7 días</option>
          </select>
        </div>
        <label className="switch" htmlFor="pConfirm" style={{ marginTop: 14 }}>
          <input type="checkbox" id="pConfirm" checked={!!settings?.confirm_done} onChange={(e) => onSettings({ confirm_done: e.target.checked })} />
          <span className="tg" aria-hidden="true" />
          <span>Confirmar antes de completar o reabrir</span>
        </label>
        <div className="field" style={{ marginTop: 16 }}>
          <span className="lbl">Apariencia</span>
          <ThemeToggle />
        </div>
      </section>

      <PushCard supabase={supabase} settings={settings} onSettings={onSettings} onToast={onToast} />

      <section className="card">
        <h3>Tus datos</h3>
        <p className="note" style={{ margin: '0 0 12px' }}>Descarga una copia de todo lo que has guardado. Útil como respaldo o para un informe.</p>
        <div className="prof-actions">
          <button className="btn sm" type="button" onClick={exportCSV}><Svg size={15}>{I.download}</Svg>Tareas en Excel (CSV)</button>
          <button className="btn sm" type="button" onClick={exportJSON}><Svg size={15}>{I.download}</Svg>Respaldo completo (JSON)</button>
        </div>
      </section>

      <section className="card">
        <h3>Cuenta</h3>
        <button className="btn sm" type="button" onClick={onLogout}><Svg size={15}>{I.logout}</Svg>Cerrar sesión</button>
      </section>
    </div>
  );
}

