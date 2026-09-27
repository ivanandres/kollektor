'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Avatar } from './Avatar';
import { SearchIcon } from './icons';
import s from './Nav.module.css';

const isActive = (path: string, href: string) =>
  href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);

/** Mobile screens that are full-screen flows (no tab bar), as in the mockups. */
const NO_TAB_BAR = [/^\/coleccion\/[^/]+/, /^\/agregar/];
export const hasTabBar = (path: string) => !NO_TAB_BAR.some((r) => r.test(path));

export function BottomNav() {
  const path = usePathname();
  if (!hasTabBar(path)) return null;
  const tab = (href: string, label: string) => (
    <Link href={href} className={s.tab} aria-current={isActive(path, href) ? 'page' : undefined}>
      {label}
    </Link>
  );
  return (
    <>
      <div className={s.spacer} aria-hidden />
      <nav className={s.bottom} aria-label="Principal">
        {tab('/', 'Inicio')}
        {tab('/coleccion', 'Colección')}
        <Link href="/agregar" className={s.plus} aria-label="Agregar vinilo">
          +
        </Link>
        {tab('/wishlist', 'Wishlist')}
        {tab('/perfil', 'Perfil')}
      </nav>
    </>
  );
}

// — Web top nav —

interface ShellCtx {
  openSearch: () => void;
  setNavActions: (node: ReactNode) => void;
  navActions: ReactNode;
}
export const Shell = createContext<ShellCtx>({
  openSearch: () => {},
  setNavActions: () => {},
  navActions: null,
});
export const useShell = () => useContext(Shell);

/** Lets a page put extra buttons in the web top nav (e.g. "Editar" on the ficha). */
export function NavActions({ children }: { children: ReactNode }) {
  const { setNavActions } = useShell();
  useEffect(() => {
    setNavActions(children);
    return () => setNavActions(null);
  }, [children, setNavActions]);
  return null;
}

export function useNavActionsState() {
  return useState<ReactNode>(null);
}

export function TopNav({ dimmed = false }: { dimmed?: boolean }) {
  const path = usePathname();
  const { openSearch, navActions } = useShell();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={isActive(path, href) ? 'page' : undefined}>
      {label}
    </Link>
  );
  // The collection screens have their own text filter, so the nav drops the search box (1l, 1n).
  const showSearch = !path.startsWith('/coleccion');
  return (
    <header className={`nav ${s.top}`} style={dimmed ? { opacity: 0.35 } : undefined}>
      <Link href="/" className={`nav-brand ${s.brand}`}>
        Kolektorz
      </Link>
      <nav className={s.links} aria-label="Principal">
        {link('/', 'Inicio')}
        {link('/coleccion', 'Colección')}
        {link('/wishlist', 'Wishlist')}
        {link('/estadisticas', 'Estadísticas')}
        {link('/logros', 'Logros')}
      </nav>
      {showSearch ? (
        <button type="button" className={`searchbox ${s.search}`} onClick={openSearch}>
          <SearchIcon size={15} />
          Buscar en tu colección <span className={s.kbd}>⌘K</span>
        </button>
      ) : null}
      {navActions}
      <Link href="/agregar" className={`btn btn-primary ${s.btn38}`}>
        + Agregar vinilo
      </Link>
      <Avatar size={32} />
    </header>
  );
}
