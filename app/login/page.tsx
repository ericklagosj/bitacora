'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || password.length < 6) {
      setError('Escribe tu correo y una contraseña de al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(
          error.message.includes('Invalid login')
            ? 'Correo o contraseña incorrectos.'
            : error.message.includes('Email not confirmed')
              ? 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.'
              : error.message
        );
        setBusy(false);
        return;
      }
      window.location.href = '/';
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        setError(error.message.includes('already') ? 'Ese correo ya tiene una cuenta. Inicia sesión.' : error.message);
        setBusy(false);
        return;
      }
      if (data.session) {
        window.location.href = '/';
      } else {
        setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
        setMode('login');
        setBusy(false);
      }
    }
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12.5l5 5L20 6.5" />
            </svg>
          </div>
          <b style={{ font: '800 22px/1 var(--display)', letterSpacing: '-.025em' }}>Bitácora</b>
        </div>
        <div>
          <h1>{mode === 'login' ? 'Entra a tu bitácora' : 'Crea tu cuenta'}</h1>
          <p style={{ marginTop: 6 }}>
            {mode === 'login'
              ? 'Tus tareas, etiquetas y apuntes en el PC y el celular.'
              : 'Tu espacio personal se crea automáticamente.'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input id="email" type="text" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.cl" />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            style={{ border: '1px solid var(--line-2)', borderRadius: 11, background: 'var(--surface)', padding: '10px 12px', minHeight: 46, width: '100%' }}
          />
        </div>
        {error && <p className="err">{error}</p>}
        {info && <p className="ok-msg">{info}</p>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
        <div className="auth-switch">
          {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </div>
      </form>
    </main>
  );
}
