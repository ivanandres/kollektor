'use client';

import { Suspense } from 'react';
import { CollectionMobile } from '@/features/collection/CollectionMobile';
import { CollectionWeb } from '@/features/collection/CollectionWeb';
import { Responsive } from '@/lib/responsive';

/** Colección: 1d/1e on mobile, 1l on web. */
export default function CollectionPage() {
  return (
    <Suspense>
      <Responsive mobile={<CollectionMobile />} desktop={<CollectionWeb />} />
    </Suspense>
  );
}
