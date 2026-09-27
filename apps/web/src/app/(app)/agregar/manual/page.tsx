'use client';

import { Suspense } from 'react';
import { ManualForm } from '@/features/add/ManualForm';

export default function ManualPage() {
  return (
    <Suspense>
      <ManualForm />
    </Suspense>
  );
}
