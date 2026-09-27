'use client';

import { Suspense } from 'react';
import { AddFlow } from '@/features/add/AddFlow';

export default function AddPage() {
  return (
    <Suspense>
      <AddFlow />
    </Suspense>
  );
}
