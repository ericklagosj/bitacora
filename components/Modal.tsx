'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Diálogo nativo <dialog> controlado por React (Esc y el fondo lo cierran). */
export function Modal({
  open,
  onClose,
  small,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  small?: boolean;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handle = () => onCloseRef.current();
    const backdrop = (e: MouseEvent) => {
      if (e.target === d) onCloseRef.current();
    };
    d.addEventListener('close', handle);
    d.addEventListener('click', backdrop);
    return () => {
      d.removeEventListener('close', handle);
      d.removeEventListener('click', backdrop);
    };
  }, []);

  return (
    <dialog ref={ref} className={small ? 'small' : undefined} aria-labelledby={labelledBy}>
      {open ? children : null}
    </dialog>
  );
}
