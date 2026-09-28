'use client';

import type { ImportStatus } from '@kollektor/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { api, errorMessage } from '@/lib/api';
import { num } from '@kollektor/app-logic';
import { useInvalidateAll } from '@/lib/queries';

/** Discogs account link, Discogs/CSV import with live progress, and CSV export. */
export function Importer() {
  const toast = useToast();
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  const { data: discogs } = useQuery({
    queryKey: ['discogs'],
    queryFn: () => api.me.discogs.status(),
  });
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [csvReport, setCsvReport] = useState<string | null>(null);
  const stop = useRef(false);
  const file = useRef<HTMLInputElement>(null);

  // Finish the OAuth handshake when Discogs sends the user back here.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const token = p.get('oauth_token');
    const verifier = p.get('oauth_verifier');
    if (p.get('discogs') === 'cancelled') toast.show('Cancelaste la conexión con Discogs.');
    if (!token || !verifier) return;
    window.history.replaceState(null, '', `${window.location.pathname}#importar`);
    api.me.discogs
      .complete(token, verifier)
      .then((r) => {
        toast.show(`Conectaste tu cuenta de Discogs (${r.username}).`);
        return qc.invalidateQueries({ queryKey: ['discogs'] });
      })
      .catch((e) => toast.show(errorMessage(e), 'error'));
  }, [qc, toast]);

  // Resume a running import (e.g. after reloading the page).
  useEffect(() => {
    api.imports
      .status()
      .then((st) => {
        setStatus(st);
        if (st.pending > 0 || st.listing) void run();
      })
      .catch(() => {});
    return () => {
      stop.current = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (running) return;
    setRunning(true);
    stop.current = false;
    setNote(null);
    try {
      for (;;) {
        if (stop.current) return;
        const r = await api.imports.runBatch();
        setStatus(r.status);
        if (r.status.pending === 0 && !r.status.listing) break;
        if (r.done + r.failed + r.retried === 0 && !r.status.listing) {
          setNote(
            `Quedan ${num(r.status.pending)} discos en espera; se reintentan en unos minutos.`,
          );
          break;
        }
      }
      await invalidate();
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function startDiscogs(own: boolean) {
    try {
      const r = await api.imports.startDiscogs(own ? undefined : username.trim());
      setStatus(r.status);
      toast.show(`Importando ${num(r.total)} discos de ${r.username}.`);
      void run();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  async function importCsv(f: File) {
    if (f.size > 2 * 1024 * 1024) return toast.show('El archivo pesa más de 2 MB.', 'error');
    try {
      const r = await api.imports.csv(await f.text());
      setStatus(r.status);
      const lines = [
        `${num(r.queued)} filas para importar`,
        r.skipped ? `${num(r.skipped)} salteadas` : null,
        r.errors.length
          ? `${r.errors.length} con errores (${r.errors
              .slice(0, 3)
              .map((e) => `línea ${e.line}: ${e.message}`)
              .join('; ')})`
          : null,
        r.warnings.length ? `${r.warnings.length} advertencias` : null,
      ].filter(Boolean);
      setCsvReport(lines.join(' · '));
      void run();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  async function exportCsv() {
    try {
      const csv = await api.collection.exportCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `kolektorz-coleccion-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  async function connect() {
    try {
      const { authorizeUrl } = await api.me.discogs.connect(`${window.location.origin}/perfil`);
      window.location.href = authorizeUrl;
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  async function disconnect() {
    try {
      await api.me.discogs.disconnect();
      await qc.invalidateQueries({ queryKey: ['discogs'] });
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  }

  const total = status ? status.pending + status.done + status.failed : 0;
  const active = running || (status && (status.pending > 0 || status.listing));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-neutral-700)' }}>
          Cuenta de Discogs
        </div>
        {discogs?.connected ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              fontSize: 14,
            }}
          >
            <span>
              Conectada como <b>{discogs.username}</b>
            </span>
            <button type="button" className="link" style={{ fontSize: 13 }} onClick={disconnect}>
              Desconectar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary cta"
            style={{ fontWeight: 800 }}
            onClick={connect}
          >
            <span>Conectar mi cuenta de Discogs</span>
            <span>↗</span>
          </button>
        )}
      </div>
      {discogs?.connected ? (
        <button
          type="button"
          className="btn btn-primary cta"
          disabled={!!active}
          onClick={() => startDiscogs(true)}
        >
          <span>Importar mi colección de Discogs</span>
          <span>→</span>
        </button>
      ) : (
        <form
          style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim()) void startDiscogs(false);
          }}
        >
          <div className="field">
            <label htmlFor="dg-user">Importar una colección pública de Discogs</label>
            <input
              id="dg-user"
              className="input"
              style={{ minHeight: 48 }}
              placeholder="usuario de Discogs"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ minHeight: 48 }}
            disabled={!!active || !username.trim()}
          >
            Importar
          </button>
        </form>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 48 }}
          disabled={!!active}
          onClick={() => file.current?.click()}
        >
          Importar CSV
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: 48 }}
          onClick={exportCsv}
        >
          Exportar CSV
        </button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importCsv(f);
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
        El CSV puede ser el export de Discogs o tu propia planilla (artista, álbum, año, sello,
        precio, moneda, estado…). Importar lo mismo dos veces no duplica discos.
      </div>
      {csvReport ? <div style={{ fontSize: 12 }}>{csvReport}</div> : null}
      {status && total > 0 ? (
        <div style={{ padding: '10px 12px', background: 'var(--color-surface)', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{active ? 'Importando…' : 'Última importación'}</b>
            <span>
              {num(status.done)} de {num(total)}
              {status.listing ? '+' : ''}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--color-bg)', marginTop: 8 }}>
            <div
              style={{
                height: 8,
                width: `${Math.round((status.done / Math.max(1, total)) * 100)}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
          {status.failed ? (
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--color-neutral-700)' }}>
              {num(status.failed)} no se pudieron importar.
            </div>
          ) : null}
          {note ? <div style={{ fontSize: 12, marginTop: 6 }}>{note}</div> : null}
        </div>
      ) : null}
      <div style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>
        Datos provistos por Discogs.
      </div>
    </div>
  );
}
