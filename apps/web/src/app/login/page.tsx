'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import s from './login.module.css';

/** 1a — Login / registro. */
export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [signup, setSignup] = useState(params.get('modo') === 'registro');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (signup) {
        const name = username.trim() || email.split('@')[0] || 'Coleccionista';
        await api.auth.signUp({ name, email: email.trim(), password });
        if (username.trim()) {
          try {
            await api.me.updateProfile({ username: username.trim() });
          } catch (err) {
            // The account exists; the username can be fixed later from Perfil.
            console.warn(err);
          }
        }
      } else {
        await api.auth.signIn({ email: email.trim(), password });
      }
      await qc.invalidateQueries({ queryKey: keys.session });
      qc.removeQueries({ queryKey: keys.profile });
      router.replace(target);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setError(null);
    if (!email.trim()) {
      setError('Escribí tu email y te mandamos un link para elegir otra contraseña.');
      return;
    }
    try {
      await api.auth.requestPasswordReset(email.trim(), `${window.location.origin}/restablecer`);
      setNotice('Si el email está registrado, te llega un link para elegir una contraseña nueva.');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className={s.screen}>
      <form className={s.col} onSubmit={submit}>
        <div className={s.brand}>Kolektorz</div>
        <h1 className={s.headline} style={{ margin: '28px 0 0' }}>
          Qué tenés.
          <br />
          Qué querés.
          <br />
          Cuánto vale.
        </h1>
        <div className={s.rule} />
        <div className={s.seg} role="group" aria-label="Modo">
          <button type="button" aria-pressed={!signup} onClick={() => setSignup(false)}>
            Iniciar sesión
          </button>
          <button type="button" aria-pressed={signup} onClick={() => setSignup(true)}>
            Crear cuenta
          </button>
        </div>
        <div className={s.fields}>
          {signup ? (
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                className="input"
                placeholder="ivan.discos"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="ivan@mail.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              required
              minLength={signup ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        {signup ? (
          <div className={s.note}>
            Tu colección es privada por defecto. Podés hacerla pública desde Perfil.
          </div>
        ) : (
          <div className={s.forgot}>
            <button type="button" onClick={forgot}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>
        )}
        {error ? (
          <div className={s.error} role="alert">
            {error}
          </div>
        ) : null}
        {notice ? <div className={s.ok}>{notice}</div> : null}
        <div className={s.grow} />
        <button className={`btn btn-primary ${s.cta}`} disabled={busy}>
          <span>{busy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Entrar'}</span>
          <span>→</span>
        </button>
      </form>
    </div>
  );
}
