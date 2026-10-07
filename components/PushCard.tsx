'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Settings } from '@/lib/types';

function base64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

type Status = 'checking' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied';

export function PushCard({
  supabase,
  settings,
  onSettings,
  onToast,
}: {
  supabase: SupabaseClient;
  settings: Settings | null;
  onSettings: (p: Partial<Settings>) => void;
  onToast: (m: string) => void;
}) {
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus(isIOS && !standalone ? 'ios-install' : 'unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      if (Notification.permission === 'denied') return setStatus('denied');
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'on' : 'off');
    })().catch(() => setStatus('unsupported'));
  }, []);

  async function enable() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return onToast('Faltan las llaves de notificaciones en el servidor');
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(key) });
      const json = sub.toJSON();
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({ endpoint: json.endpoint!, p256dh: json.keys!.p256dh, auth: json.keys!.auth }, { onConflict: 'endpoint' });
      if (error) throw error;
      setStatus('on');
      onToast('Recordatorios activados en este dispositivo');
    } catch (e) {
      onToast('No se pudo activar: ' + (e instanceof Error ? e.message : 'error desconocido'));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const r = await fetch('/api/push/test', { method: 'POST' });
      const j = (await r.json().catch(() => ({}))) as { sent?: number; total?: number; error?: string };
      if (!r.ok) onToast(j.error ?? 'No se pudo enviar la prueba');
      else if (j.sent) onToast(`Prueba enviada a ${j.sent} dispositivo${j.sent === 1 ? '' : 's'}. Debería llegar en segundos.`);
      else onToast('No se pudo entregar la prueba. Desactiva y vuelve a activar los recordatorios.');
    } catch {
      onToast('Sin conexión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('off');
      onToast('Recordatorios desactivados en este dispositivo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3>Recordatorios</h3>
      <div className="push-actions">
        {status === 'checking' && <p className="push-state">Revisando este dispositivo…</p>}
        {status === 'ios-install' && (
          <p className="push-state">
            En iPhone, primero instala la app: toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>. Ábrela desde ese ícono y activa los recordatorios aquí.
          </p>
        )}
        {status === 'unsupported' && <p className="push-state">Este navegador no permite notificaciones. Prueba con Chrome, Edge o la app instalada.</p>}
        {status === 'denied' && <p className="push-state">Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio.</p>}
        {status === 'off' && (
          <>
            <p className="push-state">Recibe un aviso cada mañana con las tareas atrasadas.</p>
            <button className="btn primary sm" type="button" onClick={enable} disabled={busy}>
              {busy ? 'Activando…' : 'Activar en este dispositivo'}
            </button>
          </>
        )}
        {status === 'on' && (
          <>
            <p className="push-state">Activados en este dispositivo. Llegan cada mañana.</p>
            <button className="btn primary sm" type="button" onClick={sendTest} disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar notificación de prueba'}
            </button>
            <button className="btn sm" type="button" onClick={disable} disabled={busy}>Desactivar aquí</button>
          </>
        )}
        <label className="switch" htmlFor="optMail">
          <input type="checkbox" id="optMail" checked={!!settings?.email_digest} onChange={(e) => onSettings({ email_digest: e.target.checked })} />
          <span className="tg" aria-hidden="true" />
          <span>También avisarme por correo</span>
        </label>
      </div>
    </section>
  );
}
