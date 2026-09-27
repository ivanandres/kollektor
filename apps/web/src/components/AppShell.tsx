'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/queries';
import { CommandK } from './CommandK';
import { BottomNav, Shell, TopNav } from './Nav';

/** Signed-in area: session gate, web top nav + ⌘K, mobile tab bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { data: session, isPending, isError } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navActions, setNavActions] = useState<ReactNode>(null);

  useEffect(() => {
    if (!isPending && (isError || !session))
      router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [isPending, isError, session, router, path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // ⌘K is the web search; on a phone-sized screen go to the search screen instead.
        if (window.matchMedia('(min-width: 960px)').matches) setSearchOpen((o) => !o);
        else router.push('/buscar');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  useEffect(() => setSearchOpen(false), [path]);

  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const ctx = useMemo(
    () => ({ openSearch: () => setSearchOpen(true), navActions, setNavActions }),
    [navActions],
  );

  if (isPending || !session) return <div style={{ minHeight: '100dvh' }} aria-busy="true" />;

  return (
    <Shell.Provider value={ctx}>
      <div className="d-only">
        <TopNav dimmed={searchOpen} />
      </div>
      <main>{children}</main>
      <div className="m-only">
        <BottomNav />
      </div>
      {searchOpen ? <CommandK onClose={closeSearch} /> : null}
    </Shell.Provider>
  );
}
