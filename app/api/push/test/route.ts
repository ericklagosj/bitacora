import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServerSupabase } from '@/lib/supabase/server';

// Envía una notificación de prueba a los dispositivos del usuario que la pide.
export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión primero' }, { status: 401 });

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return NextResponse.json({ error: 'Faltan las llaves de notificaciones en el servidor' }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:bitacora@example.com', pub, priv);

  // RLS: solo devuelve los dispositivos de este usuario.
  const { data: subs, error } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs?.length) return NextResponse.json({ error: 'No hay dispositivos con recordatorios activos' }, { status: 404 });

  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'Bitácora', body: 'Notificación de prueba: los recordatorios funcionan en este dispositivo.', url: '/', tag: 'bitacora-prueba' })
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id);
        removed++;
      }
    }
  }
  return NextResponse.json({ sent, removed, total: subs.length });
}
