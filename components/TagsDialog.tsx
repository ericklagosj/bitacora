'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tag } from '@/lib/types';
import { COLOR_NAMES, I, PALETTE, Svg } from './icons';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  tags: Tag[];
  max: number;
  onClose: () => void;
  onCreate: (name: string, color: number) => Promise<string | null>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onCycleColor: (t: Tag) => void;
  onMove: (id: string, dir: number) => void;
  onDelete: (t: Tag) => void;
}

export function TagsDialog(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} labelledBy="gTitle">
      <TagsBody {...props} />
    </Modal>
  );
}

function TagsBody({ tags, max, onClose, onCreate, onRename, onCycleColor, onMove, onDelete }: Props) {
  const freeColor = () => {
    const used = tags.map((t) => t.color);
    for (let i = 0; i < 10; i++) if (!used.includes(i)) return i;
    return 0;
  };
  const [name, setName] = useState('');
  const [color, setColor] = useState(freeColor);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = tags.length >= max;

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(id);
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setErr('Escribe un nombre para la etiqueta.');
    setBusy(true);
    const problem = await onCreate(n, color);
    setBusy(false);
    if (problem) return setErr(problem);
    setName('');
    setErr('');
    const used = [...tags.map((t) => t.color), color];
    let c = 0;
    while (used.includes(c) && c < 9) c++;
    setColor(c);
  }

  return (
    <div className="dlg">
      <header>
        <div>
          <div className="eyebrow">Carpetas</div>
          <h2 id="gTitle">Tus etiquetas</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Svg size={18}>{I.close}</Svg></button>
      </header>
      <div className="body">
        <form className="field" onSubmit={create}>
          <label htmlFor="ntName">
            Crear etiqueta <span className="note">· {tags.length} de {max}</span>
          </label>
          <div className="limit" aria-hidden="true"><i style={{ width: `${(tags.length / max) * 100}%` }} /></div>
          <div className="addsub">
            <input ref={inputRef} id="ntName" maxLength={20} placeholder="Ej: Rendiciones" value={name} disabled={full} onChange={(e) => { setName(e.target.value); setErr(''); }} />
            <button className="btn primary sm" type="submit" disabled={full || busy}>Crear</button>
          </div>
          <div className="swatches" role="group" aria-label="Color de la etiqueta">
            {PALETTE.map((p, i) => (
              <button key={i} type="button" className="sw" aria-pressed={i === color} aria-label={COLOR_NAMES[i]} style={{ background: p[0] }} onClick={() => setColor(i)} />
            ))}
          </div>
          {(err || full) && <p className="err">{full ? 'Llegaste al máximo de 10 etiquetas. Elimina una para crear otra.' : err}</p>}
        </form>
        <div>
          <div className="note" style={{ marginBottom: 2 }}>Toca el nombre para renombrar, la carpeta para cambiar color y las flechas para ordenar.</div>
          {tags.length ? (
            tags.map((t, i) => <TagRow key={t.id} tag={t} first={i === 0} last={i === tags.length - 1} onRename={onRename} onCycleColor={onCycleColor} onMove={onMove} onDelete={onDelete} />)
          ) : (
            <p className="note">Aún no tienes etiquetas. Crea la primera arriba.</p>
          )}
        </div>
      </div>
      <footer>
        <button className="btn primary" type="button" onClick={onClose}>Listo</button>
      </footer>
    </div>
  );
}

function TagRow({
  tag, first, last, onRename, onCycleColor, onMove, onDelete,
}: {
  tag: Tag;
  first: boolean;
  last: boolean;
  onRename: (id: string, name: string) => Promise<boolean>;
  onCycleColor: (t: Tag) => void;
  onMove: (id: string, dir: number) => void;
  onDelete: (t: Tag) => void;
}) {
  const [val, setVal] = useState(tag.name);
  return (
    <div className="tagrow">
      <button type="button" className="colorbtn" aria-label={`Cambiar color de ${tag.name}`} onClick={() => onCycleColor(tag)}>
        <span className="folder" style={{ background: PALETTE[tag.color % 10][0] }} />
      </button>
      <input
        type="text"
        value={val}
        maxLength={20}
        aria-label={`Nombre de la etiqueta ${tag.name}`}
        onChange={(e) => setVal(e.target.value)}
        onBlur={async () => {
          if (val.trim() === tag.name) return;
          const ok = await onRename(tag.id, val);
          if (!ok) setVal(tag.name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button type="button" className="icon-btn" aria-label={`Subir ${tag.name}`} disabled={first} onClick={() => onMove(tag.id, -1)}><Svg size={16}>{I.up}</Svg></button>
      <button type="button" className="icon-btn" aria-label={`Bajar ${tag.name}`} disabled={last} onClick={() => onMove(tag.id, 1)}><Svg size={16}>{I.down}</Svg></button>
      <button type="button" className="icon-btn del" aria-label={`Eliminar etiqueta ${tag.name}`} onClick={() => onDelete(tag)}><Svg size={16}>{I.trash}</Svg></button>
    </div>
  );
}
