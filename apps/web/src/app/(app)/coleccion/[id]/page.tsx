'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ItemMobile } from '@/features/item/ItemMobile';
import { ItemWeb } from '@/features/item/ItemWeb';
import { errorMessage } from '@/lib/api';
import { useItem } from '@/lib/queries';
import { Responsive } from '@/lib/responsive';

/** Ficha del vinilo: 1i on mobile, 1n on web. */
export default function ItemPage() {
  return (
    <Suspense>
      <Item />
    </Suspense>
  );
}

function Item() {
  const { id } = useParams<{ id: string }>();
  const track = useSearchParams().get('tema');
  const { data: item, isPending, error } = useItem(id);
  if (isPending)
    return <div className="skeleton" style={{ width: '100%', maxWidth: 480, aspectRatio: '1' }} />;
  if (!item)
    return (
      <div className="state">
        {errorMessage(error)} <Link href="/coleccion">Volver a la colección →</Link>
      </div>
    );
  return (
    <Responsive
      mobile={<ItemMobile item={item} openTrack={track} />}
      desktop={<ItemWeb item={item} />}
    />
  );
}
