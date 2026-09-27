'use client';

import { DashboardNumbers } from '@/features/dashboard/DashboardNumbers';
import { DashboardProgress } from '@/features/dashboard/DashboardProgress';
import { DashboardWeb } from '@/features/dashboard/DashboardWeb';
import { useDashboardVariant } from '@/lib/prefs';
import { Responsive } from '@/lib/responsive';

/** Inicio: 1c (default) or 1b on mobile — switchable in Perfil — and 1k on web. */
export default function HomePage() {
  const [variant] = useDashboardVariant();
  return (
    <Responsive
      mobile={variant === 'numeros' ? <DashboardNumbers /> : <DashboardProgress />}
      desktop={<DashboardWeb />}
    />
  );
}
