'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Repeat, Subtask, Task } from '@/lib/types';
import { I, Svg } from './icons';
import { Modal } from './Modal';

export interface TaskDraft {
  title: string;
  notes: string;
  tag_id: string | null;
  due_date: string;
  priority: boolean;
  repeat: Repeat | null;
  remind_after_days: number | null;
  subtasks: Subtask[];
}

interface Props {
  open: boolean;
  task: Task | null;
  defaultTag: string;
  defaultDue: string;
  tagOptions: ReactNode;
  newTagId: string | null;
  onNewTagConsumed: () => void;
  onCreateTag: () => void;
  onClose: () => void;
  onSave: (d: TaskDraft) => Promise<void> | void;
  onDelete: (t: Task) => void;
  onPostpone: (t: Task) => void;
}

export function TaskDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} labelledBy="tTitle">
      <TaskForm {...props} />
    </Modal>
  );
}

function TaskForm({ task, defaultTag, defaultDue, tagOptions, newTagId, onNewTagConsumed, onCreateTag, onClose, onSave, onDelete, onPostpone }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [tag, setTag] = useState(task ? task.tag_id ?? '' : defaultTag);
  const [due, setDue] = useState(task?.due_date ?? defaultDue);
  const [rec, setRec] = useState<string>(task?.repeat ?? '');
  const [rem, setRem] = useState<string>(task?.remind_after_days ? String(task.remind_after_days) : '');
  const [pri, setPri] = useState(task?.priority ?? false);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [subs, setSubs] = useState<Subtask[]>(task ? task.subtasks.map((s) => ({ ...s })) : []);
  const [subIn, setSubIn] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => titleRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (newTagId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTag(newTagId);
      onNewTagConsumed();
    }
  }, [newTagId, onNewTagConsumed]);

  function addSub() {
    const v = subIn.trim();
    if (!v) return;
    setSubs((s) => [...s, { title: v, done: false, position: s.length }]);
    setSubIn('');
    subRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setErr(true);
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    await onSave({
      title: t,
      notes: notes.trim(),
      tag_id: tag || null,
      due_date: due || defaultDue,
      priority: pri,
      repeat: (rec || null) as Repeat | null,
      remind_after_days: rem ? Number(rem) : null,
      subtasks: subs.map((s, i) => ({ title: s.title, done: s.done, position: i })),
    });
    setBusy(false);
  }

  return (
    <form className="dlg" onSubmit={submit} noValidate>
      <header>
        <div>
          <div className="eyebrow">{task ? `Tarea N° ${String(task.folio).padStart(4, '0')}` : 'Nueva tarea'}</div>
          <h2 id="tTitle">{task ? 'Editar tarea' : '¿Qué hay que hacer?'}</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Svg size={18}>{I.close}</Svg></button>
      </header>
      <div className="body">
        <div className="field">
          <label htmlFor="fTitle" className="sr">Título</label>
          <input
            ref={titleRef}
            type="text"
            id="fTitle"
            className="ttl-input"
            maxLength={140}
            placeholder="Ej: Revisar boletas de honorarios"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setErr(false); }}
          />
          {err && <p className="err">Escribe un título para la tarea.</p>}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="fTag">Etiqueta</label>
            <select id="fTag" value={tag} onChange={(e) => (e.target.value === '__new' ? onCreateTag() : setTag(e.target.value))}>
              {tagOptions}
            </select>
          </div>
          <div className="field">
            <label htmlFor="fDue">Fecha</label>
            <input type="date" id="fDue" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="fRec">Repetir</label>
            <select id="fRec" value={rec} onChange={(e) => setRec(e.target.value)}>
              <option value="">No se repite</option>
              <option value="d">Cada día hábil</option>
              <option value="w">Cada semana</option>
              <option value="m">Cada mes</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="fRem">Avisar si sigue pendiente</label>
            <select id="fRem" value={rem} onChange={(e) => setRem(e.target.value)}>
              <option value="">Usar ajuste general</option>
              <option value="1">Después de 1 día</option>
              <option value="3">Después de 3 días</option>
              <option value="5">Después de 5 días</option>
              <option value="7">Después de 7 días</option>
            </select>
          </div>
        </div>
        <label className="switch" htmlFor="fPri">
          <input type="checkbox" id="fPri" checked={pri} onChange={(e) => setPri(e.target.checked)} />
          <span className="tg" aria-hidden="true" />
          <span>Prioridad alta</span>
        </label>
        <div className="field">
          <label htmlFor="fNotes">Notas</label>
          <textarea id="fNotes" placeholder="N° de documento, a quién contactar, detalles…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Subtareas</span>
          <div className="subs">
            {subs.map((s, i) => (
              <div key={i} className={`sub ${s.done ? 'isdone' : ''}`}>
                <label className="chk">
                  <input
                    type="checkbox"
                    checked={s.done}
                    aria-label={`Subtarea hecha: ${s.title}`}
                    onChange={(e) => setSubs((xs) => xs.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
                  />
                  <span className="box"><Svg size={12} w={3}>{I.check}</Svg></span>
                </label>
                <span className="t">{s.title}</span>
                <button type="button" className="icon-btn" aria-label="Quitar subtarea" onClick={() => setSubs((xs) => xs.filter((_, j) => j !== i))}>
                  <Svg size={15}>{I.close}</Svg>
                </button>
              </div>
            ))}
          </div>
          <div className="addsub">
            <input
              ref={subRef}
              placeholder="Agregar subtarea"
              aria-label="Nueva subtarea"
              value={subIn}
              onChange={(e) => setSubIn(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            <button className="btn sm" type="button" onClick={addSub}>Agregar</button>
          </div>
        </div>
      </div>
      <footer>
        {task && (
          <button className="btn ghost left" type="button" onClick={() => onDelete(task)}>
            <Svg size={16}>{I.trash}</Svg>Eliminar
          </button>
        )}
        {task && !task.done_at && (
          <button className="btn" type="button" onClick={() => onPostpone(task)}>Pasar a mañana</button>
        )}
        <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </footer>
    </form>
  );
}
