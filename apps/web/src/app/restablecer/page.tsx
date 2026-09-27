'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import s from '../login/login.module.css';

/** Elegir una contraseña nueva desde el link del mail. */
export default function ResetPage() {
  return (
    <Suspense>
      <Reset />
    </Suspense>
  );
}

function Reset() {
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.screen}>
      <form className={s.col} onSubmit={submit}>
        <div className={s.brand}>Kolektorz</div>
        <h1 className={s.headline} style={{ margin: '28px 0 0', fontSize: 40 }}>
          Contraseña nueva.
        </h1>
        <div className={s.rule} />
        {!token ? (
          <div className={s.error}>
            El link no es válido. Pedí otro desde “¿Olvidaste tu contraseña?”.
          </div>
        ) : done ? (
          <div className={s.ok}>
            Listo, ya podés entrar con tu contraseña nueva.{' '}
            <Link href="/login">Iniciar sesión →</Link>
          </div>
        ) : (
          <>
            <div className={s.fields}>
              <div className="field">
                <label htmlFor="password">Contraseña nueva</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div className={s.note}>Al cambiarla se cierran tus otras sesiones.</div>
            {error ? <div className={s.error}>{error}</div> : null}
            <div className={s.grow} />
            <button className={`btn btn-primary ${s.cta}`} disabled={busy}>
              <span>Guardar contraseña</span>
              <span>→</span>
            </button>
          </>
        )}
      </form>
    </div>
  );
}
