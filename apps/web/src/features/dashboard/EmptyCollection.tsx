import Link from 'next/link';
import s from './dashboard.module.css';

/** With 0 records everything is zero: invite to add the first one or import. */
export function EmptyCollection() {
  return (
    <section
      className={`${s.empty} ${s.rule}`}
      style={{ borderTop: '2px solid var(--color-divider)' }}
    >
      <div className="kicker" style={{ color: 'var(--color-accent)' }}>
        Tu colección
      </div>
      <div className={s.emptyTitle}>Todavía no hay discos. Empezá por el que tengas más cerca.</div>
      <div className="muted" style={{ fontSize: 14 }}>
        Sacale una foto a la portada, escaneá el código de barras o cargalo a mano. Si ya usás
        Discogs, importá tu colección entera.
      </div>
      <Link href="/agregar" className="btn btn-primary cta">
        <span>Agregar mi primer vinilo</span>
        <span>→</span>
      </Link>
      <Link href="/perfil#importar" className="btn btn-secondary cta" style={{ fontWeight: 800 }}>
        <span>Importar de Discogs o CSV</span>
        <span>→</span>
      </Link>
    </section>
  );
}
