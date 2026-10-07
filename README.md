# Bitácora

Tareas diarias de oficina con etiquetas, historial y recordatorios. Es una **PWA instalable** en el celular y el escritorio, con notificaciones push.

**App en vivo:** https://bitacora-tan.vercel.app

Nació de un problema real: en mi trabajo anotaba tareas en papeles y planillas que terminaban perdiéndose.

## Funcionalidades

- Tareas con fecha, prioridad, notas, subtareas y repetición (diaria hábil, semanal o mensual)
- Hasta **10 etiquetas** por espacio, con color y orden propios. El límite se valida en la base de datos
- Confirmación antes de completar o eliminar, con opción de **deshacer**
- Vistas Hoy, Próximas, Historial y Bitácora (apuntes diarios), más un filtro por día de la semana y por etiqueta
- Timbre "HECHO" con la hora de cierre, folio correlativo por tarea, progreso del día y racha
- **Recordatorios**: un cron diario envía push (y correo opcional) con las tareas atrasadas según el plazo de cada una
- Modo claro y oscuro automáticos; diseño responsive para escritorio y celular

## Stack

Next.js 16 (App Router) · TypeScript · Supabase (Postgres, Auth, Row Level Security) · Vercel (hosting + Cron) · Web Push (`web-push`) · Resend (opcional)

## Decisiones técnicas

- **Todo pertenece a un _workspace_.** El modo personal es un espacio de un solo miembro, así el futuro modo equipo no exige migrar datos.
- **Seguridad con RLS.** El navegador habla directo con Supabase y cada política limita las filas a los miembros del espacio. No hay endpoints propios para el CRUD.
- **Sin llave `service_role` en el servidor.** El cron llama a funciones `SECURITY DEFINER` protegidas por un secreto guardado en un esquema `private` que la API no expone.
- **Espacio y ajustes automáticos** al registrarse, mediante un trigger sobre `auth.users`.

## Estructura

```
app/                  rutas (/, /login, /api/cron/recordatorios, manifest)
components/           BitacoraApp, diálogos de tarea y etiquetas, tarjeta de push
lib/                  cliente de Supabase, tipos y utilidades de fecha
proxy.ts              refresca la sesión y protege las rutas
public/sw.js          service worker de notificaciones
supabase/schema.sql   tablas, RLS, triggers y funciones
docs/prototipo.html   prototipo de diseño original
```

## Correr en local

1. `npm install`
2. Copia `.env.example` a `.env.local` y completa las variables
3. Ejecuta `supabase/schema.sql` en el SQL Editor de tu proyecto de Supabase y guarda el secreto del cron:
   ```sql
   insert into private.app_secrets (name, value) values ('cron', 'EL_MISMO_VALOR_QUE_CRON_SECRET');
   ```
4. `npm run dev` y abre http://localhost:3000
5. Para probar el push en local: `npx next dev --experimental-https`

## Despliegue gratis

- **Vercel Hobby**: importa el repo y agrega las variables de `.env.example`. El cron (`vercel.json`) corre una vez al día a las 11:00 UTC (8:00 en Chile con horario de verano).
- **Supabase Free**: en Authentication → URL Configuration, agrega la URL de Vercel como Site URL y Redirect URL.

## Próximos pasos

- Modo equipo con invitaciones
- Vista Kanban
- Exportar el historial a Excel
