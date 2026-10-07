import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { Resend } from 'resend';

// Cron diario de Vercel: avisa por push (y correo opcional) las tareas atrasadas.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('No autorizado', { status: 401 });
  }

  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:bitacora@example.com', pub, priv);
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  const { data: digest, error } = await db.rpc('reminder_digest', { p_secret: secret });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let pushes = 0;
  let emails = 0;
  for (const row of (digest ?? []) as { user_id: string; email: string; titles: string[]; email_digest: boolean }[]) {
    const n = row.titles.length;
    const title = `Tienes ${n} tarea${n === 1 ? '' : 's'} atrasada${n === 1 ? '' : 's'}`;
    const body = n === 1 ? row.titles[0] : `${row.titles[0]} y ${n - 1} más`;

    if (pub && priv) {
      const { data: subs } = await db.rpc('reminder_subscriptions', { p_secret: secret, p_user: row.user_id });
      for (const s of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title, body, url: '/' })
          );
          pushes++;
        } catch {
          // Suscripción vencida o rechazada: se ignora; el usuario puede reactivarla desde la app.
        }
      }
    }

    if (resend && row.email_digest && row.email) {
      const { error: mailErr } = await resend.emails.send({
        from: process.env.RESEND_FROM || 'Bitácora <onboarding@resend.dev>',
        to: row.email,
        subject: title,
        text: `Estas tareas siguen pendientes:\n\n${row.titles.map((t) => `- ${t}`).join('\n')}\n\nAbre Bitácora para revisarlas.`,
      });
      if (!mailErr) emails++;
    }
  }

  return NextResponse.json({ usuarios: digest?.length ?? 0, pushes, emails });
}
