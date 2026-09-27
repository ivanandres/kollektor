'use client';

import { DashboardNumbers } from '@/features/dashboard/DashboardNumbers';
import { DashboardProgress } from '@/features/dashboard/DashboardProgress';
import { DashboardWeb } from '@/features/dashboard/DashboardWeb';
import { useDashboardVariant } from '@/lib/prefs';

/** Inicio: 1c (default) or 1b on mobile — switchable in Perfil — and 1k on web. */
export default function HomePage() {
  const [variant] = useDashboardVariant();
  return (
    <>
      <div className="m-only">
        {variant === 'numeros' ? <DashboardNumbers /> : <DashboardProgress />}
      </div>
      <div className="d-only">
        <DashboardWeb />
      </div>
    </>
  );
}
