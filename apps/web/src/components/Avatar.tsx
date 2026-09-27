'use client';

import Link from 'next/link';
import { useProfile } from '@/lib/queries';

/** Square avatar (neutral block when there is no photo), links to Perfil. */
export function Avatar({ size = 36 }: { size?: number }) {
  const { data: profile } = useProfile();
  return (
    <Link
      href="/perfil"
      aria-label="Perfil"
      style={{
        display: 'block',
        width: size,
        height: size,
        flex: 'none',
        background: 'var(--color-neutral-300)',
        overflow: 'hidden',
      }}
    >
      {profile?.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : null}
    </Link>
  );
}
