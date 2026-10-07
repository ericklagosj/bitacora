'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Settings, Subtask, Tag, Task, View } from '@/lib/types';
import {
  addDays, diff, fmtDue, iso, localDay, localTime, longDate, nextDate, pad, parseISO, startOfToday, todayISO, weekDays,
} from '@/lib/dates';
import { I, PALETTE, Svg } from './icons';
import { Modal } from './Modal';
import { TaskDialog, type TaskDraft } from './TaskDialog';
import { TagsDialog } from './TagsDialog';
import { PushCard } from './PushCard';

const MAXTAGS = 10;
const VIEWS: [View, string][] = [
  ['hoy', 'Hoy'],
  ['proximas', 'Próximas'],
  ['historial', 'Historial'],
  ['bitacora', 'Bitácora'],
];
const REC: Record<string, string> = { d: 'Diaria', w: 'Semanal', m: 'Mensual' };

interface ConfirmOpts {
  title: string;
  msg?: string;
  task?: string;
  ok?: string;
  danger?: boolean;
}
interface ToastState {
  id: number;
  msg: string;
  undo?: () => void;
}

const folioTxt = (n: number) => `N° ${String(n).padStart(4, '0')}`;

export default function BitacoraApp() {
  const supabase = useMemo<SupabaseClient>(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [wsId, setWsId] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<Settings | null>(null);

  const [view, setView] = useState<View>('hoy');
  const [filter, setFilter] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [justStamped, setJustStamped] = useState<string | null>(null);

  const [quickTitle, setQuickTitle] = useState('');
  const [quickTag, setQuickTag] = useState('');
  const [quickDate, setQuickDate] = useState(todayISO());

  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [tagsOpen, setTagsOpen] = useState<null | 'manage' | 'task' | 'quick'>(null);
  const [newTagForTask, setNewTagForTask] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hour, setHour] = useState(12);
  const TODAY = todayISO();

  /* ---------- Carga ---------- */
  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) {
      window.location.href = '/login';
      return;
    }
    setEmail(user.email ?? '');
    const { data: mem, error: memErr } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    if (memErr || !mem) {
      setLoadError(memErr?.message ?? 'No se encontró tu espacio de trabajo. Revisa que el script schema.sql se haya ejecutado antes de crear tu cuenta.');
      setLoading(false);
      return;
    }
    const ws = mem.workspace_id as string;
    setWsId(ws);
    const [tg, tk, nt, st] = await Promise.all([
      supabase.from('tags').select('*').eq('workspace_id', ws).order('position'),
      supabase.from('tasks').select('*, subtasks(*)').eq('workspace_id', ws).order('due_date'),
      supabase.from('daily_notes').select('day, body').eq('workspace_id', ws),
      supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle(),
    ]);
    const err = tg.error || tk.error || nt.error || st.error;
    if (err) {
      setLoadError(err.message);
      setLoading(false);
      return;
    }
    setTags((tg.data ?? []) as Tag[]);
    setTasks(
      ((tk.data ?? []) as Task[]).map((t) => ({
        ...t,
        subtasks: [...(t.subtasks ?? [])].sort((a, b) => a.position - b.position),
      }))
    );
    setNotes(Object.fromEntries((nt.data ?? []).map((n: { day: string; body: string }) => [n.day, n.body])));
    setSettings(
      (st.data as Settings) ?? { user_id: user.id, remind_after_days: 3, confirm_done: true, email_digest: true }
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    setHour(new Date().getHours());
  }, [load]);

  /* ---------- Avisos ---------- */
  const showToast = useCallback((msg: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), msg, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 2600);
  }, []);
  const fail = useCallback((m: string) => showToast('No se pudo guardar: ' + m), [showToast]);

  const ask = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...opts, resolve })),
    []
  );
  const closeConfirm = (v: boolean) => {
    if (!confirm) return;
    confirm.resolve(v);
    setConfirm(null);
  };

  const tagOf = (id: string | null) => tags.find((t) => t.id === id);

  /* ---------- Tareas ---------- */
  async function createTask(d: TaskDraft) {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        workspace_id: wsId,
        title: d.title,
        notes: d.notes,
        tag_id: d.tag_id,
        due_date: d.due_date,
        priority: d.priority,
        repeat: d.repeat,
        remind_after_days: d.remind_after_days,
      })
      .select()
      .single();
    if (error) return fail(error.message), null;
    let subs: Subtask[] = [];
    if (d.subtasks.length) {
      const r = await supabase
        .from('subtasks')
        .insert(d.subtasks.map((s, i) => ({ task_id: data.id, title: s.title, done: s.done, position: i })))
        .select();
      subs = (r.data ?? []) as Subtask[];
    }
    const t = { ...(data as Task), subtasks: subs };
    setTasks((ts) => [...ts, t]);
    return t;
  }

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return showToast('Escribe el título de la tarea');
    const t = await createTask({
      title, notes: '', tag_id: quickTag || null, due_date: quickDate || TODAY, priority: false, repeat: null, remind_after_days: null, subtasks: [],
    });
    if (t) {
      setQuickTitle('');
      showToast('Tarea agregada · ' + fmtDue(t.due_date));
    }
  }

  async function saveTask(d: TaskDraft) {
    if (editing === 'new' || editing === null) {
      const t = await createTask(d);
      if (t) {
        setEditing(null);
        showToast('Tarea creada · ' + fmtDue(t.due_date));
      }
      return;
    }
    const t = editing;
    const { error } = await supabase
      .from('tasks')
      .update({
        title: d.title, notes: d.notes, tag_id: d.tag_id, due_date: d.due_date, priority: d.priority, repeat: d.repeat, remind_after_days: d.remind_after_days,
      })
      .eq('id', t.id);
    if (error) return fail(error.message);
    await supabase.from('subtasks').delete().eq('task_id', t.id);
    let subs: Subtask[] = [];
    if (d.subtasks.length) {
      const r = await supabase
        .from('subtasks')
        .insert(d.subtasks.map((s, i) => ({ task_id: t.id, title: s.title, done: s.done, position: i })))
        .select();
      subs = (r.data ?? []) as Subtask[];
    }
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...d, subtasks: subs } : x)));
    setEditing(null);
    showToast('Cambios guardados');
  }

  async function setDone(t: Task, doneAt: string | null) {
    const { error } = await supabase.from('tasks').update({ done_at: doneAt }).eq('id', t.id);
    if (error) {
      fail(error.message);
      return false;
    }
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done_at: doneAt } : x)));
    return true;
  }

  async function toggleDone(t: Task) {
    const completing = !t.done_at;
    if (settings?.confirm_done) {
      const ok = await ask(
        completing
          ? { title: '¿Marcar como completada?', msg: 'Quedará timbrada en el historial con la hora de hoy.', task: t.title, ok: 'Sí, completar' }
          : { title: '¿Reabrir esta tarea?', msg: 'Volverá a tus pendientes.', task: t.title, ok: 'Sí, reabrir' }
      );
      if (!ok) return;
    }
    const stamp = completing ? new Date().toISOString() : null;
    if (!(await setDone(t, stamp))) return;
    let spawned: Task | null = null;
    if (completing) {
      setJustStamped(t.id);
      if (t.repeat) {
        const due = nextDate(t.due_date < TODAY ? TODAY : t.due_date, t.repeat);
        const exists = tasks.some((x) => !x.done_at && x.title === t.title && x.repeat === t.repeat && x.due_date === due);
        if (!exists) {
          spawned = await createTask({
            title: t.title, notes: t.notes, tag_id: t.tag_id, due_date: due, priority: t.priority, repeat: t.repeat, remind_after_days: t.remind_after_days,
            subtasks: t.subtasks.map((s) => ({ title: s.title, done: false, position: s.position })),
          });
        }
      }
    }
    showToast(
      completing ? (spawned ? 'Completada. Próxima repetición: ' + fmtDue(spawned.due_date) : 'Completada y timbrada') : 'Tarea reabierta',
      async () => {
        await setDone(t, completing ? null : t.done_at);
        if (spawned) {
          const sp = spawned;
          await supabase.from('tasks').delete().eq('id', sp.id);
          setTasks((ts) => ts.filter((x) => x.id !== sp.id));
        }
      }
    );
  }

  async function removeTask(t: Task) {
    const ok = await ask({ title: '¿Eliminar esta tarea?', msg: 'Se borrará de tus listas y del historial.', task: t.title, ok: 'Sí, eliminar', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('tasks').delete().eq('id', t.id);
    if (error) return fail(error.message);
    setTasks((ts) => ts.filter((x) => x.id !== t.id));
    setEditing(null);
    showToast('Tarea eliminada', async () => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          id: t.id, workspace_id: t.workspace_id, title: t.title, notes: t.notes, tag_id: t.tag_id, due_date: t.due_date,
          priority: t.priority, repeat: t.repeat, remind_after_days: t.remind_after_days, done_at: t.done_at,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      let subs: Subtask[] = [];
      if (t.subtasks.length) {
        const r = await supabase
          .from('subtasks')
          .insert(t.subtasks.map((s, i) => ({ task_id: t.id, title: s.title, done: s.done, position: i })))
          .select();
        subs = (r.data ?? []) as Subtask[];
      }
      setTasks((ts) => [...ts, { ...(data as Task), subtasks: subs }]);
    });
  }

  async function postpone(t: Task) {
    const prev = t.due_date;
    const due = addDays(1);
    const { error } = await supabase.from('tasks').update({ due_date: due }).eq('id', t.id);
    if (error) return fail(error.message);
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, due_date: due } : x)));
    setEditing(null);
    showToast('Movida a mañana', async () => {
      await supabase.from('tasks').update({ due_date: prev }).eq('id', t.id);
      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, due_date: prev } : x)));
    });
  }

  /* ---------- Etiquetas ---------- */
  async function createTag(name: string, color: number) {
    if (tags.length >= MAXTAGS) return 'Llegaste al máximo de 10 etiquetas.';
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return 'Ya tienes una etiqueta con ese nombre.';
    const position = tags.length ? Math.max(...tags.map((t) => t.position)) + 1 : 0;
    const { data, error } = await supabase.from('tags').insert({ workspace_id: wsId, name, color, position }).select().single();
    if (error) return error.message.includes('Máximo') ? 'Llegaste al máximo de 10 etiquetas.' : error.message;
    const tag = data as Tag;
    setTags((ts) => [...ts, tag]);
    if (tagsOpen === 'task') {
      setNewTagForTask(tag.id);
      setTagsOpen(null);
      showToast(`Etiqueta “${name}” creada y asignada`);
    } else if (tagsOpen === 'quick') {
      setQuickTag(tag.id);
      setTagsOpen(null);
      showToast(`Etiqueta “${name}” creada`);
    } else showToast(`Etiqueta creada (${tags.length + 1}/${MAXTAGS})`);
    return null;
  }

  async function updateTag(id: string, patch: Partial<Tag>) {
    const { error } = await supabase.from('tags').update(patch).eq('id', id);
    if (error) {
      fail(error.message.includes('duplicate') ? 'ese nombre ya existe' : error.message);
      return false;
    }
    setTags((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)).sort((a, b) => a.position - b.position));
    return true;
  }

  async function moveTag(id: string, dir: number) {
    const i = tags.findIndex((t) => t.id === id);
    const j = i + dir;
    if (j < 0 || j >= tags.length) return;
    const a = tags[i];
    const b = tags[j];
    const list = tags.map((t, k) => ({ ...t, position: k }));
    const pa = list[j].position;
    const pb = list[i].position;
    setTags(
      list
        .map((t) => (t.id === a.id ? { ...t, position: pa } : t.id === b.id ? { ...t, position: pb } : t))
        .sort((x, y) => x.position - y.position)
    );
    await Promise.all(
      list.map((t) =>
        supabase.from('tags').update({ position: t.id === a.id ? pa : t.id === b.id ? pb : t.position }).eq('id', t.id)
      )
    );
  }

  async function deleteTag(tag: Tag) {
    const from = tagsOpen;
    setTagsOpen(null);
    const n = tasks.filter((x) => x.tag_id === tag.id).length;
    const ok = await ask({
      title: `¿Eliminar la etiqueta “${tag.name}”?`,
      msg: n ? `${n} ${n === 1 ? 'tarea quedará' : 'tareas quedarán'} sin etiqueta. Las tareas no se borran.` : 'Ninguna tarea usa esta etiqueta.',
      ok: 'Sí, eliminar',
      danger: true,
    });
    if (ok) {
      const affected = tasks.filter((x) => x.tag_id === tag.id).map((x) => x.id);
      const { error } = await supabase.from('tags').delete().eq('id', tag.id);
      if (error) fail(error.message);
      else {
        setTags((ts) => ts.filter((t) => t.id !== tag.id));
        setTasks((ts) => ts.map((x) => (x.tag_id === tag.id ? { ...x, tag_id: null } : x)));
        if (filter === tag.id) setFilter(null);
        showToast('Etiqueta eliminada', async () => {
          const { error } = await supabase.from('tags').insert(tag);
          if (error) return fail(error.message);
          if (affected.length) await supabase.from('tasks').update({ tag_id: tag.id }).in('id', affected);
          setTags((ts) => [...ts, tag].sort((a, b) => a.position - b.position));
          setTasks((ts) => ts.map((x) => (affected.includes(x.id) ? { ...x, tag_id: tag.id } : x)));
        });
      }
    }
    setTagsOpen(from);
  }

  /* ---------- Notas y ajustes ---------- */
  function setNote(body: string) {
    setNotes((n) => ({ ...n, [TODAY]: body }));
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      const { error } = await supabase.from('daily_notes').upsert({ workspace_id: wsId, day: TODAY, body });
      if (error) fail(error.message);
    }, 700);
  }

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase.from('user_settings').upsert(next);
    if (error) fail(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  /* ---------- Atajo N ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement as HTMLElement | null;
      if ((a && (a.matches('input,textarea,select') || a.isContentEditable)) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      setEditing('new');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Derivados ---------- */
  const q = query.toLowerCase();
  const visible = tasks.filter(
    (t) => (!filter || t.tag_id === filter) && (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
  );
  const pend = visible.filter((t) => !t.done_at);
  const byDue = (a: Task, b: Task) => a.due_date.localeCompare(b.due_date) || Number(b.priority) - Number(a.priority);
  const remindOf = (t: Task) => t.remind_after_days ?? settings?.remind_after_days ?? 3;
  const pToday = tasks.filter((t) => !t.done_at && diff(t.due_date) === 0).length;
  const pLate = tasks.filter((t) => !t.done_at && diff(t.due_date) < 0).length;
  const counts: Record<View, number | ''> = {
    hoy: tasks.filter((t) => !t.done_at && diff(t.due_date) <= 0).length,
    proximas: tasks.filter((t) => !t.done_at && diff(t.due_date) > 0).length,
    historial: tasks.filter((t) => t.done_at).length,
    bitacora: '',
  };
  const old = tasks.filter((t) => !t.done_at && -diff(t.due_date) >= remindOf(t));
  const todayAll = tasks.filter((t) => diff(t.due_date) <= 0 && (!t.done_at || localDay(t.done_at) === TODAY));
  const doneToday = todayAll.filter((t) => t.done_at).length;
  const pct = todayAll.length ? Math.round((doneToday / todayAll.length) * 100) : 0;
  const weekDone = tasks.filter((t) => t.done_at && diff(localDay(t.done_at)) > -7).length;
  const streak = (() => {
    let n = 0;
    for (let i = 1; i < 60; i++) {
      const d = addDays(-i);
      const dt = parseISO(d);
      if (dt.getDay() === 0 || dt.getDay() === 6) continue;
      const due = tasks.filter((t) => t.due_date === d);
      if (!due.length) continue;
      if (due.every((t) => t.done_at && localDay(t.done_at) <= d)) n++;
      else break;
    }
    return n;
  })();
  const upcoming = tasks.filter((t) => !t.done_at && diff(t.due_date) > 0).sort(byDue).slice(0, 4);
  const T0 = startOfToday();

  if (loading) return <div className="loading">Cargando tu bitácora…</div>;
  if (loadError)
    return (
      <div className="errorbox">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--display)' }}>No pudimos cargar tus datos</h2>
        <p className="note">{loadError}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn primary" type="button" onClick={() => window.location.reload()}>Reintentar</button>
          <button className="btn" type="button" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>
    );

  /* ---------- Render helpers ---------- */
  const tabStyle = (t: Tag) => {
    const p = PALETTE[t.color % 10];
    return { background: `color-mix(in srgb, ${p[0]} 16%, var(--surface))`, color: `color-mix(in srgb, ${p[0]} 55%, var(--fg))` };
  };

  const taskRow = (t: Task) => {
    const tag = tagOf(t.tag_id);
    const late = !t.done_at && diff(t.due_date) < 0;
    const subDone = t.subtasks.filter((s) => s.done).length;
    const doneDay = t.done_at ? localDay(t.done_at) : '';
    return (
      <div key={t.id} className={`task ${t.done_at ? 'isdone' : ''} ${late ? 'is-late' : ''}`}>
        <label className="chk">
          <input
            type="checkbox"
            checked={!!t.done_at}
            onChange={() => toggleDone(t)}
            aria-label={`${t.done_at ? 'Reabrir' : 'Completar'}: ${t.title}`}
          />
          <span className="box"><Svg size={14} w={3}>{I.check}</Svg></span>
        </label>
        <button className="open" type="button" onClick={() => setEditing(t)}>
          <span className="ttl">{t.title}</span>
          <span className="meta">
            <span className="folio">{folioTxt(t.folio)}</span>
            {!t.done_at && (
              <span className={`ic ${late ? 'late' : ''}`}>
                <Svg size={13}>{I.cal}</Svg>
                {fmtDue(t.due_date)}
                {late ? ' · atrasada' : ''}
              </span>
            )}
            {t.subtasks.length > 0 && (
              <span className="ic">
                <span className="mini"><i style={{ width: `${(subDone / t.subtasks.length) * 100}%` }} /></span>
                {subDone}/{t.subtasks.length}
              </span>
            )}
            {t.repeat && (
              <span className="ic"><Svg size={13}>{I.repeat}</Svg>{REC[t.repeat]}</span>
            )}
            {t.notes && (
              <span className="ic"><Svg size={13}>{I.note}</Svg>Notas</span>
            )}
            {tag && (
              <span className="ic" style={{ color: PALETTE[tag.color % 10][0] }}>
                ● <span style={{ color: 'var(--muted)' }}>{tag.name}</span>
              </span>
            )}
          </span>
        </button>
        {t.priority && !t.done_at && <span className="pri">Alta</span>}
        {tag && !t.done_at && <span className="ftab" style={tabStyle(tag)}>{tag.name}</span>}
        {t.done_at && (
          <span className={`stamp ${justStamped === t.id ? 'just' : ''}`} aria-label="Completada">
            Hecho
            <small>
              {doneDay === TODAY ? '' : `${doneDay.slice(8, 10)}/${doneDay.slice(5, 7)} `}
              {localTime(t.done_at)}
            </small>
          </span>
        )}
        <div className="acts">
          <button className="icon-btn edit" type="button" onClick={() => setEditing(t)} aria-label="Editar tarea">
            <Svg size={17}>{I.edit}</Svg>
          </button>
          <button className="icon-btn del" type="button" onClick={() => removeTask(t)} aria-label="Eliminar tarea">
            <Svg size={17}>{I.trash}</Svg>
          </button>
        </div>
      </div>
    );
  };

  const group = (key: string, title: string, items: Task[], cls = '', empty?: React.ReactNode) => {
    if (!items.length && !empty) return null;
    return (
      <section className="group" key={key}>
        <div className={`ghead ${cls}`}>
          <h2>{title}</h2>
          <span className="n">{items.length}</span>
        </div>
        {items.length ? items.map(taskRow) : <div className="empty">{empty}</div>}
      </section>
    );
  };

  let list: React.ReactNode;
  if (dayFilter && view !== 'bitacora') {
    const items = visible.filter((t) => t.due_date === dayFilter).sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at));
    list = (
      <>
        {group('day', longDate(dayFilter), items, diff(dayFilter) < 0 ? 'late' : '', <><b>Día libre</b>No hay tareas con fecha {fmtDue(dayFilter).toLowerCase()}.</>)}
        <button className="btn ghost sm" type="button" onClick={() => setDayFilter(null)} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
          Ver todas las fechas
        </button>
      </>
    );
  } else if (view === 'hoy') {
    list = (
      <>
        {group('late', 'Atrasadas', pend.filter((t) => diff(t.due_date) < 0).sort(byDue), 'late')}
        {group('today', 'Para hoy', pend.filter((t) => diff(t.due_date) === 0).sort(byDue), '',
          query ? 'Sin resultados para hoy.' : <><b>Nada pendiente para hoy</b>Escribe una tarea arriba o presiona N.</>)}
        {group('done', 'Completadas hoy',
          visible.filter((t) => t.done_at && localDay(t.done_at) === TODAY).sort((a, b) => b.done_at!.localeCompare(a.done_at!)), 'ok')}
      </>
    );
  } else if (view === 'proximas') {
    const up = pend.filter((t) => diff(t.due_date) > 0).sort(byDue);
    list = (
      <>
        {group('week', 'Próximos 7 días', up.filter((t) => diff(t.due_date) <= 7), '', <><b>Semana despejada</b>No hay tareas para los próximos 7 días.</>)}
        {group('later', 'Más adelante', up.filter((t) => diff(t.due_date) > 7))}
      </>
    );
  } else if (view === 'historial') {
    const done = visible.filter((t) => t.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));
    const days = [...new Set(done.map((t) => localDay(t.done_at!)))];
    list = days.length ? (
      days.map((d) => group(d, d === TODAY ? 'Hoy' : longDate(d), done.filter((t) => localDay(t.done_at!) === d), 'ok'))
    ) : (
      <div className="empty"><b>Historial vacío</b>Cuando completes una tarea, quedará aquí con fecha y hora.</div>
    );
  } else {
    const keys = Object.keys(notes)
      .filter((k) => k !== TODAY && notes[k].trim() && (!q || notes[k].toLowerCase().includes(q)))
      .sort()
      .reverse();
    list = (
      <>
        <section className="group">
          <div className="ghead"><h2>Hoy · {longDate(TODAY)}</h2></div>
          <label htmlFor="logToday" className="sr">Notas de hoy</label>
          <textarea className="ruled big" id="logToday" placeholder="Escribe tus apuntes del día…" value={notes[TODAY] ?? ''} onChange={(e) => setNote(e.target.value)} />
        </section>
        {keys.map((k) => (
          <section className="group" key={k}>
            <div className="ghead"><h2>{longDate(k)}</h2></div>
            <div className="logday">{notes[k]}</div>
          </section>
        ))}
      </>
    );
  }

  const greeting = view === 'hoy' ? (hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches') : VIEWS.find((v) => v[0] === view)![1];
  const summary =
    view === 'hoy' ? (
      pToday || pLate ? (
        <>
          Tienes <b>{pToday} pendiente{pToday === 1 ? '' : 's'}</b> para hoy
          {pLate ? <> y <b className="late">{pLate} atrasada{pLate === 1 ? '' : 's'}</b></> : null}.
        </>
      ) : (
        'Todo al día. Buen trabajo.'
      )
    ) : view === 'proximas' ? 'Lo que viene en los próximos días.' : view === 'historial' ? 'Todo lo que has completado, con fecha y hora.' : 'Tus apuntes del día, ordenados por fecha.';

  const navTo = (v: View) => {
    setView(v);
    setDayFilter(null);
    window.scrollTo({ top: 0 });
  };

  const tagOptions = (withCreate: boolean) => (
    <>
      <option value="">Sin etiqueta</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
      {withCreate && tags.length < MAXTAGS && <option value="__new">+ Crear etiqueta…</option>}
    </>
  );

  const seg = (
    <div className="seg">
      <button type="button" aria-pressed="true">Personal</button>
      <button type="button" aria-pressed="false" onClick={() => showToast('El modo equipo llegará en una próxima versión')}>
        Equipo <span className="soon">PRONTO</span>
      </button>
    </div>
  );

  return (
    <>
      <header className="mhead">
        <div className="brand">
          <div className="mark" aria-hidden="true"><Svg size={16} w={2.8}>{I.check}</Svg></div>
          <b>Bitácora</b>
        </div>
        {seg}
      </header>

      <div className="app">
        <aside className="side">
          <div className="brand">
            <div className="mark" aria-hidden="true"><Svg size={18} w={2.8}>{I.check}</Svg></div>
            <div><b>Bitácora</b><small>Tareas de oficina</small></div>
          </div>
          {seg}
          <nav className="nav" aria-label="Vistas">
            {VIEWS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => navTo(k)} aria-current={k === view ? 'page' : undefined}>
                <Svg size={18}>{I[k]}</Svg>
                <span>{l}</span>
                <span className={`count ${k === 'hoy' && pLate ? 'hot' : ''}`}>{counts[k]}</span>
              </button>
            ))}
          </nav>
          <div>
            <div className="sec-head"><span>Carpetas</span><span>{tags.length}/{MAXTAGS}</span></div>
            <div className="tags">
              {tags.length ? (
                tags.map((t) => (
                  <button key={t.id} className="tag" type="button" aria-pressed={filter === t.id} onClick={() => setFilter(filter === t.id ? null : t.id)}>
                    <span className="folder" style={{ background: PALETTE[t.color % 10][0] }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{t.name}</span>
                    <span className="count">{tasks.filter((x) => x.tag_id === t.id && !x.done_at).length}</span>
                  </button>
                ))
              ) : (
                <p className="note" style={{ padding: '0 12px', color: 'var(--ink-muted)' }}>Aún no tienes etiquetas.</p>
              )}
            </div>
            <button className="side-btn" type="button" onClick={() => setTagsOpen('manage')}>
              <Svg size={16}>{I.plus}</Svg>Gestionar etiquetas
            </button>
          </div>
          <div className="side-foot">
            Presiona <kbd>N</kbd> para crear una tarea.
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ overflowWrap: 'anywhere' }}>{email}</span>
              <button type="button" onClick={logout}>Salir</button>
            </div>
          </div>
        </aside>

        <main className="main">
          <section className="hero">
            <div className="cal" aria-hidden="true">
              <div className="m">{T0.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '').toUpperCase()}</div>
              <div className="d">{pad(T0.getDate())}</div>
              <div className="w">{T0.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')}</div>
            </div>
            <div className="hello">
              <h1>{greeting}</h1>
              <p>{summary}</p>
            </div>
            <div className="top-actions">
              <label className="search" htmlFor="q">
                <Svg size={17}>{I.search}</Svg>
                <span className="sr">Buscar</span>
                <input id="q" type="search" placeholder="Buscar tareas o notas" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <button className="btn primary" type="button" onClick={() => setEditing('new')}>
                <Svg size={16} w={2.4}>{I.plus}</Svg>Nueva tarea
              </button>
            </div>
          </section>

          <div className="week" role="group" aria-label="Filtrar por día de esta semana">
            {weekDays().map((d, i) => {
              const s = iso(d);
              const due = tasks.filter((t) => t.due_date === s);
              return (
                <button
                  key={s}
                  type="button"
                  className={`day ${s === TODAY ? 'is-today' : ''} ${i > 4 ? 'weekend' : ''}`}
                  aria-pressed={dayFilter === s}
                  aria-label={`${longDate(s)}, ${due.length} tareas`}
                  onClick={() => {
                    setDayFilter(dayFilter === s ? null : s);
                    if (view === 'bitacora') setView('hoy');
                  }}
                >
                  <span className="dl">{d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '').slice(0, 3)}</span>
                  <span className="dn">{d.getDate()}</span>
                  <span className="pips">
                    {due.slice(0, 4).map((t) => (
                      <i key={t.id} className={t.done_at ? 'd' : diff(s) < 0 ? 'l' : 'p'} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <form className="quick" onSubmit={quickAdd} aria-label="Agregar tarea rápida">
            <span className="plus" aria-hidden="true"><Svg size={18} w={2.4}>{I.plus}</Svg></span>
            <input type="text" autoComplete="off" placeholder="¿Qué tienes que hacer?" aria-label="Título de la tarea" value={quickTitle} onChange={(e) => setQuickTitle(e.target.value)} maxLength={140} />
            <div className="sel-row">
              <select
                aria-label="Etiqueta"
                value={quickTag}
                onChange={(e) => {
                  if (e.target.value === '__new') setTagsOpen('quick');
                  else setQuickTag(e.target.value);
                }}
              >
                {tagOptions(true)}
              </select>
              <input type="date" aria-label="Fecha" value={quickDate} onChange={(e) => setQuickDate(e.target.value)} />
              <button className="btn primary sm" type="submit">Agregar</button>
            </div>
          </form>

          {old.length > 0 && view !== 'bitacora' && (
            <div className="alert">
              <span className="bell" aria-hidden="true"><Svg size={19}>{I.bell}</Svg></span>
              <div className="txt">
                <strong>
                  {old.length} {old.length === 1 ? 'tarea lleva' : 'tareas llevan'} demasiado tiempo pendiente{old.length === 1 ? '' : 's'}.
                </strong>{' '}
                La más antigua venció hace {Math.max(...old.map((t) => -diff(t.due_date)))} días.
              </div>
              <label htmlFor="thr">Avisar tras</label>
              <select id="thr" value={settings?.remind_after_days ?? 3} onChange={(e) => saveSettings({ remind_after_days: Number(e.target.value) })}>
                <option value={1}>1 día</option>
                <option value={3}>3 días</option>
                <option value={5}>5 días</option>
                <option value={7}>7 días</option>
              </select>
            </div>
          )}

          {view !== 'bitacora' && (
            <div className="tabs" role="toolbar" aria-label="Filtrar por etiqueta">
              <button className="tab" type="button" aria-pressed={!filter} onClick={() => setFilter(null)}>
                Todas <span className="n">{tasks.filter((t) => !t.done_at).length}</span>
              </button>
              {tags.map((t) => (
                <button key={t.id} className="tab" type="button" aria-pressed={filter === t.id} onClick={() => setFilter(filter === t.id ? null : t.id)}>
                  <span className="folder" style={{ background: PALETTE[t.color % 10][0] }} />
                  {t.name}
                </button>
              ))}
              <button className="tab add" type="button" onClick={() => setTagsOpen('manage')}>
                <Svg size={14} w={2.4}>{I.plus}</Svg>Etiqueta
              </button>
            </div>
          )}

          <div id="list">
            {query && <p className="note" style={{ margin: '8px 2px 0' }}>Resultados para “{query}”</p>}
            {list}
          </div>
        </main>

        <aside className="panel">
          <section className="card">
            <h3>Progreso de hoy <small>{pad(T0.getDate())}/{pad(T0.getMonth() + 1)}</small></h3>
            <div className="ringwrap">
              <div className="ring">
                <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                  <circle className="track" cx="48" cy="48" r="40" fill="none" strokeWidth="9" />
                  <circle className="val" cx="48" cy="48" r="40" fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray="251.3" style={{ strokeDashoffset: 251.3 * (1 - pct / 100) }} />
                </svg>
                <div className="pc">{pct}%</div>
              </div>
              <div className="ringtxt">
                <b>{doneToday} de {todayAll.length}</b>
                <br />tareas de hoy completadas
                <br />{todayAll.length - doneToday ? `Te quedan ${todayAll.length - doneToday}.` : '¡Día cerrado!'}
              </div>
            </div>
            <div className="stat">
              <div><b>{weekDone}</b><span>hechas en 7 días</span></div>
              <div className="late"><b>{pLate}</b><span>atrasadas</span></div>
              <div><b>{streak}</b><span>días al día</span></div>
            </div>
          </section>
          <section className="card">
            <h3>Bitácora de hoy <small>se guarda sola</small></h3>
            <label htmlFor="note" className="sr">Apuntes de hoy</label>
            <textarea id="note" className="ruled" placeholder="Anota lo que no quieres olvidar…" value={notes[TODAY] ?? ''} onChange={(e) => setNote(e.target.value)} />
          </section>
          <section className="card">
            <h3>Próximos vencimientos</h3>
            {upcoming.length ? (
              upcoming.map((t) => {
                const d = parseISO(t.due_date);
                return (
                  <div className="up" key={t.id}>
                    <span className="mcal">
                      <span>{d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '').toUpperCase()}</span>
                      <b>{d.getDate()}</b>
                    </span>
                    <span className="t">{t.title}</span>
                  </div>
                );
              })
            ) : (
              <p className="note">Sin vencimientos próximos.</p>
            )}
          </section>
          <PushCard supabase={supabase} settings={settings} onSettings={saveSettings} onToast={showToast} />
          <section className="card">
            <h3>Protección</h3>
            <label className="switch" htmlFor="optDone">
              <input type="checkbox" id="optDone" checked={!!settings?.confirm_done} onChange={(e) => {
                saveSettings({ confirm_done: e.target.checked });
                showToast(e.target.checked ? 'Se pedirá confirmación al completar' : 'Completar ya no pedirá confirmación');
              }} />
              <span className="tg" aria-hidden="true" />
              <span>Confirmar antes de completar o reabrir</span>
            </label>
            <p className="note" style={{ margin: '10px 0 0' }}>Eliminar siempre pide confirmación y se puede deshacer.</p>
          </section>
          <section className="card mobile-only-account">
            <h3>Cuenta</h3>
            <p className="note" style={{ margin: '0 0 10px', overflowWrap: 'anywhere' }}>{email}</p>
            <button className="btn sm" type="button" onClick={logout}><Svg size={15}>{I.logout}</Svg>Cerrar sesión</button>
          </section>
        </aside>
      </div>

      <button className="fab" type="button" onClick={() => setEditing('new')} aria-label="Nueva tarea">
        <Svg size={24} w={2.4}>{I.plus}</Svg>
      </button>
      <nav className="bottom" aria-label="Vistas">
        {VIEWS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => navTo(k)} aria-current={k === view ? 'page' : undefined}>
            <Svg size={21}>{I[k]}</Svg>
            {l}
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span className="ok" aria-hidden="true"><Svg size={12} w={3.4}>{I.check}</Svg></span>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button type="button" onClick={() => {
              const u = toast.undo;
              setToast(null);
              u?.();
            }}>Deshacer</button>
          )}
        </div>
      )}

      {/* Confirmación */}
      <Modal open={!!confirm} onClose={() => closeConfirm(false)} small labelledBy="cTitle">
        {confirm && (
          <form className="dlg" onSubmit={(e) => { e.preventDefault(); closeConfirm(true); }}>
            <header>
              <div>
                <div className={`cicon ${confirm.danger ? 'bad' : 'ok'}`}>
                  <Svg size={22} w={confirm.danger ? 2 : 2.6}>{confirm.danger ? I.trash : I.check}</Svg>
                </div>
                <h2 id="cTitle">{confirm.title}</h2>
              </div>
            </header>
            <div className="body">
              {confirm.msg && <p className="confirm-msg">{confirm.msg}</p>}
              {confirm.task && <p className="confirm-task">{confirm.task}</p>}
            </div>
            <footer>
              <button className="btn" type="button" autoFocus onClick={() => closeConfirm(false)}>Cancelar</button>
              <button className={`btn ${confirm.danger ? 'danger' : 'primary'}`} type="submit">{confirm.ok ?? 'Confirmar'}</button>
            </footer>
          </form>
        )}
      </Modal>

      <TaskDialog
        open={editing !== null}
        task={editing === 'new' ? null : editing}
        defaultTag={filter ?? ''}
        defaultDue={dayFilter ?? TODAY}
        tagOptions={tagOptions(true)}
        newTagId={newTagForTask}
        onNewTagConsumed={() => setNewTagForTask(null)}
        onCreateTag={() => setTagsOpen('task')}
        onClose={() => setEditing(null)}
        onSave={saveTask}
        onDelete={(t) => removeTask(t)}
        onPostpone={(t) => postpone(t)}
      />

      <TagsDialog
        open={tagsOpen !== null}
        tags={tags}
        max={MAXTAGS}
        onClose={() => setTagsOpen(null)}
        onCreate={createTag}
        onRename={(id, name) => {
          const v = name.trim();
          if (!v || tags.some((x) => x.id !== id && x.name.toLowerCase() === v.toLowerCase())) {
            showToast('Ese nombre está vacío o ya existe');
            return Promise.resolve(false);
          }
          return updateTag(id, { name: v }).then((ok) => {
            if (ok) showToast('Etiqueta renombrada');
            return ok;
          });
        }}
        onCycleColor={(t) => updateTag(t.id, { color: (t.color + 1) % 10 })}
        onMove={moveTag}
        onDelete={deleteTag}
      />
    </>
  );
}
