'use client';

import type { Profile } from '@kollektor/api-client';
import type { ProfileUpdateInput } from '@kollektor/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CURRENCIES } from '@/components/CopyForm';
import { clearOfflineData } from '@/components/ServiceWorker';
import { useToast } from '@/components/Toasts';
import s from '@/features/flow/flow.module.css';
import p from '@/features/pages/pages.module.css';
import { Importer } from '@/features/profile/Importer';
import { api, errorMessage } from '@/lib/api';
import { relativeDay } from '@kollektor/app-logic';
import { useDashboardVariant } from '@/lib/prefs';
import { keys, useInvalidateAll, useProfile, useSession } from '@/lib/queries';
import { useDebounced } from '@/lib/search';

/** Perfil (no mockup): accesos, datos, privacidad, preferencias, importar/exportar y cuenta. */
export default function ProfilePage() {
  const { data: profile } = useProfile();
  const { data: session } = useSession();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (
      window.location.hash === '#importar' ||
      new URLSearchParams(window.location.search).has('oauth_token')
    )
      setOpen((o) => ({ ...o, '04': true }));
  }, []);

  const toggle = (n: string) => setOpen((o) => ({ ...o, [n]: !o[n] }));

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div className={p.head} style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <AvatarUpload profile={profile} />
          <div style={{ minWidth: 0 }}>
            <h1 className={p.title} style={{ fontSize: 26 }}>
              {profile?.displayName || profile?.username || 'Perfil'}
            </h1>
            <div className={p.sub}>
              @{profile?.username} · {session?.user.email}
            </div>
          </div>
        </div>
      </div>

      <nav aria-label="Más">
        <Link href="/estadisticas" className={p.linkRow}>
          Estadísticas <span style={{ color: 'var(--color-accent)' }}>→</span>
        </Link>
        <Link href="/logros" className={p.linkRow}>
          Logros <span style={{ color: 'var(--color-accent)' }}>→</span>
        </Link>
      </nav>

      <div style={{ borderTop: '2px solid var(--color-divider)', marginTop: -1 }}>
        <Section
          n="01"
          title="Tu perfil"
          sub="Nombre, username y bio"
          open={!!open['01']}
          onToggle={() => toggle('01')}
        >
          {profile ? <ProfileForm profile={profile} /> : null}
        </Section>
        <Section
          n="02"
          title="Privacidad"
          sub="Todo es privado hasta que lo hagas público"
          open={!!open['02']}
          onToggle={() => toggle('02')}
        >
          {profile ? <Privacy profile={profile} /> : null}
        </Section>
        <Section
          n="03"
          title="Preferencias"
          sub="Moneda base y vista de Inicio"
          open={!!open['03']}
          onToggle={() => toggle('03')}
        >
          {profile ? <Preferences profile={profile} /> : null}
        </Section>
        <Section
          n="04"
          title="Importar y exportar"
          sub="Discogs, CSV y copia de tu colección"
          open={!!open['04']}
          onToggle={() => toggle('04')}
          id="importar"
        >
          <Importer />
        </Section>
        <Section
          n="05"
          title="Tu actividad"
          sub="Lo último que agregaste y desbloqueaste"
          open={!!open['05']}
          onToggle={() => toggle('05')}
        >
          <Activity />
        </Section>
        <Section
          n="06"
          title="Cuenta"
          sub="Cerrar sesión o borrar tu cuenta"
          open={!!open['06']}
          onToggle={() => toggle('06')}
        >
          <Account />
        </Section>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  sub,
  open,
  onToggle,
  children,
  id,
}: {
  n: string;
  title: string;
  sub: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className={s.section} id={id}>
      <button
        type="button"
        className={`row-btn ${s.sectionHead}`}
        style={{ display: 'grid' }}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className={s.sectionNum}>{n}</span>
        <span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{title}</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-700)' }}>
            {sub}
          </span>
        </span>
        <span style={{ fontSize: 20, fontWeight: 600 }}>{open ? '−' : '+'}</span>
      </button>
      {open ? <div style={{ padding: '0 20px 20px' }}>{children}</div> : null}
    </div>
  );
}

function useSaveProfile() {
  const qc = useQueryClient();
  const toast = useToast();
  return async (patch: ProfileUpdateInput, done = 'Guardado.') => {
    try {
      const next = await api.me.updateProfile(patch);
      qc.setQueryData(keys.profile, next);
      toast.show(done);
      return true;
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      return false;
    }
  };
}

function AvatarUpload({ profile }: { profile: Profile | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const save = useSaveProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function upload(f: File) {
    const type = (['image/jpeg', 'image/png', 'image/webp'] as const).find((t) => t === f.type);
    if (!type) return toast.show('Subí una imagen JPG, PNG o WebP.', 'error');
    setBusy(true);
    try {
      const target = await api.me.avatarUpload(type);
      const url = await api.upload(target, f);
      await save({ avatarUrl: url }, 'Foto actualizada.');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        aria-label="Cambiar foto"
        onClick={() => input.current?.click()}
        disabled={busy}
        style={{
          width: 64,
          height: 64,
          flex: 'none',
          border: 0,
          padding: 0,
          background: 'var(--color-neutral-300)',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>
            {busy ? '…' : 'foto'}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? '');
  const u = useDebounced(username.trim(), 400);
  const { data: avail } = useQuery({
    queryKey: ['username', u],
    queryFn: () => api.me.usernameAvailable(u),
    enabled: u.length >= 3 && u !== profile.username,
  });
  const taken = u !== profile.username && avail && !avail.available;
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          displayName: displayName.trim() || null,
          ...(username.trim() !== profile.username ? { username: username.trim() } : {}),
          bio: bio.trim() || null,
        } as ProfileUpdateInput);
      }}
    >
      <div className="field">
        <label htmlFor="pf-name">Nombre</label>
        <input
          id="pf-name"
          className="input"
          style={{ minHeight: 48 }}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="pf-user">Username</label>
        <input
          id="pf-user"
          className="input"
          style={{ minHeight: 48 }}
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        {taken ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--color-accent-700)',
              marginTop: 4,
              fontWeight: 600,
            }}
          >
            Ese username ya está tomado.
          </div>
        ) : avail?.available && u !== profile.username ? (
          <div style={{ fontSize: 12, marginTop: 4 }}>Disponible.</div>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="pf-bio">Bio</label>
        <textarea
          id="pf-bio"
          className="input"
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      <button className="btn btn-primary cta" disabled={!!taken}>
        <span>Guardar</span>
        <span>✓</span>
      </button>
    </form>
  );
}

function Toggle2({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 180px',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--color-divider)',
      }}
    >
      <span style={{ fontSize: 14 }}>{label}</span>
      <div
        role="group"
        aria-label={label}
        className="toggle"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)`, gridAutoFlow: 'unset' }}
      >
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            style={{ padding: '9px 0', fontSize: 13, fontWeight: 600 }}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Privacy({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const vis: [string, string][] = [
    ['private', 'Privado'],
    ['public', 'Público'],
  ];
  const yn: [string, string][] = [
    ['false', 'Ocultar'],
    ['true', 'Mostrar'],
  ];
  return (
    <div>
      <Toggle2
        label="Perfil"
        value={profile.profileVisibility}
        options={vis}
        onChange={(v) => save({ profileVisibility: v as 'public' | 'private' })}
      />
      <Toggle2
        label="Colección"
        value={profile.collectionVisibility}
        options={vis}
        onChange={(v) => save({ collectionVisibility: v as 'public' | 'private' })}
      />
      <Toggle2
        label="Wishlist"
        value={profile.wishlistVisibility}
        options={vis}
        onChange={(v) => save({ wishlistVisibility: v as 'public' | 'private' })}
      />
      <Toggle2
        label="Precios pagados"
        value={String(profile.showPrices)}
        options={yn}
        onChange={(v) => save({ showPrices: v === 'true' })}
      />
      <Toggle2
        label="Valores estimados"
        value={String(profile.showValues)}
        options={yn}
        onChange={(v) => save({ showValues: v === 'true' })}
      />
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 10 }}>
        La ubicación física y el lugar de compra nunca se publican.
      </div>
      {profile.profileVisibility === 'public' ? <ShareLink username={profile.username} /> : null}
    </div>
  );
}

function ShareLink({ username }: { username: string }) {
  const toast = useToast();
  const url =
    typeof window === 'undefined' ? `/u/${username}` : `${window.location.origin}/u/${username}`;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        background: 'var(--color-surface)',
        fontSize: 13,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Link href={`/u/${username}`} className="ellipsis" style={{ minWidth: 0 }}>
        {url.replace(/^https?:\/\//, '')}
      </Link>
      <button
        type="button"
        className="link"
        style={{ fontSize: 13, flex: 'none' }}
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ title: 'Mi colección en Kolektorz', url });
            else {
              await navigator.clipboard.writeText(url);
              toast.show('Link copiado.');
            }
          } catch {
            // share sheet dismissed
          }
        }}
      >
        Compartir
      </button>
    </div>
  );
}

function Preferences({ profile }: { profile: Profile }) {
  const save = useSaveProfile();
  const invalidate = useInvalidateAll();
  const [variant, setVariant] = useDashboardVariant();
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 180px',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <span style={{ fontSize: 14 }}>
          Moneda base
          <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-700)' }}>
            Cambiarla recalcula toda la colección.
          </span>
        </span>
        <select
          className="input"
          value={profile.baseCurrency}
          onChange={async (e) => {
            if (
              await save({ baseCurrency: e.target.value }, `Ahora ves todo en ${e.target.value}.`)
            )
              await invalidate();
          }}
        >
          {[...new Set([profile.baseCurrency, ...CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <Toggle2
        label="Inicio en el teléfono"
        value={variant}
        onChange={(v) => setVariant(v as typeof variant)}
        options={[
          ['progreso', 'Progreso'],
          ['numeros', 'Números'],
        ]}
      />
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)', marginTop: 10 }}>
        Progreso: discografías, logros y recomendaciones. Números: totales, décadas y “tu colección
        en números”.
      </div>
    </div>
  );
}

function Activity() {
  const { data } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.me.activity({ limit: 15 }),
  });
  if (!data) return <div className={p.small}>Cargando…</div>;
  if (!data.length) return <div className={p.small}>Todavía no hay actividad.</div>;
  return (
    <div>
      {data.map((a) =>
        a.collectionItemId ? (
          <Link key={a.id} href={`/coleccion/${a.collectionItemId}`} className={p.row}>
            <span>{a.message}</span>
            <span className={p.small} style={{ whiteSpace: 'nowrap' }}>
              {relativeDay(a.createdAt)}
            </span>
          </Link>
        ) : (
          <div key={a.id} className={p.row}>
            <span>{a.message}</span>
            <span className={p.small} style={{ whiteSpace: 'nowrap' }}>
              {relativeDay(a.createdAt)}
            </span>
          </div>
        ),
      )}
    </div>
  );
}

function Account() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function signOut() {
    await api.auth.signOut().catch(() => {});
    qc.clear();
    await clearOfflineData();
    router.replace('/login');
  }

  async function del() {
    setBusy(true);
    try {
      await api.auth.deleteAccount(password);
      qc.clear();
      await clearOfflineData();
      router.replace('/login');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        className="btn btn-secondary cta"
        style={{ fontWeight: 800 }}
        onClick={signOut}
      >
        <span>Cerrar sesión</span>
        <span>→</span>
      </button>
      <button
        type="button"
        className="link"
        style={{ textAlign: 'left', fontSize: 13, color: 'var(--color-accent-700)' }}
        onClick={() => setConfirm(true)}
      >
        Borrar mi cuenta
      </button>
      {confirm ? (
        <div className="dialog-backdrop" style={{ zIndex: 50 }} onClick={() => setConfirm(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-title">¿Borrar tu cuenta?</div>
            <div className="dialog-body">
              Se eliminan tu colección, tu wishlist, tus cargas manuales y tus fotos. No se puede
              deshacer. Si querés una copia, exportá tu colección a CSV antes.
            </div>
            <div className="field">
              <label htmlFor="del-pass">Tu contraseña</label>
              <input
                id="del-pass"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !password}
                onClick={del}
              >
                Borrar cuenta
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
