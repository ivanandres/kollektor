import type {
  AddToCollectionInput,
  AddToWishlistInput,
  CatalogSearchQuery,
  CollectionItemFields,
  CollectionQuery,
  ProfileUpdateInput,
  UpdateCollectionItemInput,
  UpdateWishlistInput,
} from '@kollektor/schemas';
import type * as T from './types';

export type * from './types';

export type ApiErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL'
  | 'NETWORK';

/** Every failure is an ApiError with a user-facing Spanish message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly issues: { path: string; message: string }[] = [],
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** Worth retrying later (offline, server hiccup, rate limit). */
  get retryable() {
    return this.code === 'NETWORK' || this.status === 429 || this.status >= 500;
  }
}

export interface ApiClientOptions {
  /** e.g. "https://api.kollektor.app/api" or "/api" on the same origin. */
  baseUrl: string;
  /** Mobile: return the session token (sent as Bearer). Web: omit and rely on cookies. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Mobile: persist the token returned on sign-in/sign-up. */
  onToken?: (token: string) => void | Promise<void>;
  fetch?: typeof fetch;
  /** Extra headers (e.g. Origin when calling from a non-browser runtime). */
  headers?: Record<string, string>;
}

type Query = Record<string, string | number | boolean | (string | number)[] | null | undefined>;

const newKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const base = opts.baseUrl.replace(/\/$/, '');

  function qs(query?: Query) {
    if (!query) return '';
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async function raw(
    method: string,
    path: string,
    init: { body?: unknown; query?: Query; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...opts.headers,
      ...init.headers,
    };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await f(`${base}${path}${qs(init.query)}`, {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        credentials: 'include',
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Sin conexión. Revisá tu internet e intentá de nuevo.');
    }
    const newToken = res.headers.get('set-auth-token');
    if (newToken) await opts.onToken?.(newToken);
    return res;
  }

  async function request<R>(
    method: string,
    path: string,
    init: Parameters<typeof raw>[2] = {},
  ): Promise<R> {
    const res = await raw(method, path, init);
    if (res.status === 204) return undefined as R;
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const e =
        (data as {
          error?: { code?: string; message?: string; issues?: []; details?: unknown };
          message?: string;
          code?: string;
        } | null) ?? {};
      // Our API: { error: { code, message } }. Better Auth: { code, message }.
      const code = (e.error?.code ?? statusCode(res.status)) as ApiErrorCode;
      const message = e.error?.message ?? e.message ?? 'Algo salió mal. Probá de nuevo.';
      throw new ApiError(res.status, code, message, e.error?.issues ?? [], e.error?.details);
    }
    return data as R;
  }

  const get = <R>(path: string, query?: Query) => request<R>('GET', path, { query });
  const post = <R>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<R>('POST', path, { body: body ?? {}, headers });
  const patch = <R>(path: string, body: unknown) => request<R>('PATCH', path, { body });
  const del = (path: string) => request<void>('DELETE', path);
  const id = (v: string) => encodeURIComponent(v);

  return {
    auth: {
      signUp: (body: { name: string; email: string; password: string }) =>
        post<unknown>('/auth/sign-up/email', body),
      signIn: (body: { email: string; password: string }) =>
        post<unknown>('/auth/sign-in/email', body),
      signOut: () => post<unknown>('/auth/sign-out'),
      session: () =>
        get<{ user: { id: string; email: string; name: string }; session: unknown } | null>(
          '/auth/get-session',
        ),
      requestPasswordReset: (email: string, redirectTo: string) =>
        post<unknown>('/auth/request-password-reset', { email, redirectTo }),
      resetPassword: (token: string, newPassword: string) =>
        post<unknown>('/auth/reset-password', { token, newPassword }),
      deleteAccount: (password: string) => post<unknown>('/auth/delete-user', { password }),
    },
    me: {
      profile: () => get<T.Profile>('/me/profile'),
      updateProfile: (body: ProfileUpdateInput) => patch<T.Profile>('/me/profile', body),
      usernameAvailable: (username: string) =>
        get<{ username: string; available: boolean }>('/me/username-available', { username }),
      avatarUpload: (contentType: 'image/jpeg' | 'image/png' | 'image/webp') =>
        post<T.UploadTarget>('/me/avatar-upload', { contentType }),
    },
    collection: {
      list: (query: Partial<CollectionQuery> = {}) =>
        get<T.CollectionPage>('/collection', query as Query),
      facets: () => get<T.CollectionFacets>('/collection/facets'),
      get: (itemId: string) => get<T.CollectionItem>(`/collection/${id(itemId)}`),
      /** Pass the same `idempotencyKey` when retrying (e.g. generated when the form opened). */
      add: (body: AddToCollectionInput, idempotencyKey: string = newKey()) =>
        post<T.AddResult>('/collection', body, { 'Idempotency-Key': idempotencyKey }),
      update: (itemId: string, body: UpdateCollectionItemInput) =>
        patch<Omit<T.AddResult, 'replayed'>>(`/collection/${id(itemId)}`, body),
      remove: (itemId: string) => del(`/collection/${id(itemId)}`),
      /** Match a record (e.g. entered manually offline) to its Discogs edition. */
      link: (itemId: string, target: { discogsReleaseId: number } | { releaseId: string }) =>
        post<Omit<T.AddResult, 'replayed'>>(`/collection/${id(itemId)}/link`, target),
      photoUpload: (itemId: string, contentType: 'image/jpeg' | 'image/png' | 'image/webp') =>
        post<T.UploadTarget>(`/collection/${id(itemId)}/photos/upload`, { contentType }),
      addPhoto: (itemId: string, url: string, caption?: string) =>
        post<{ id: string; url: string; caption: string | null }>(
          `/collection/${id(itemId)}/photos`,
          { url, caption },
        ),
      removePhoto: (itemId: string, photoId: string) =>
        del(`/collection/${id(itemId)}/photos/${id(photoId)}`),
      exportCsvUrl: () => `${base}/collection/export.csv`,
    },
    wishlist: {
      list: (query: { status?: string[]; includePurchased?: boolean } = {}) =>
        get<T.WishlistItem[]>('/wishlist', query as Query),
      add: (body: AddToWishlistInput, idempotencyKey: string = newKey()) =>
        post<T.WishlistItem>('/wishlist', body, { 'Idempotency-Key': idempotencyKey }),
      update: (itemId: string, body: UpdateWishlistInput) =>
        patch<T.WishlistItem>(`/wishlist/${id(itemId)}`, body),
      remove: (itemId: string) => del(`/wishlist/${id(itemId)}`),
      purchase: (
        itemId: string,
        body: CollectionItemFields & { releaseId?: string; discogsReleaseId?: number },
      ) => post<Omit<T.AddResult, 'replayed'>>(`/wishlist/${id(itemId)}/purchase`, body),
    },
    catalog: {
      release: (releaseId: string) => get<T.ReleaseDetail>(`/catalog/releases/${id(releaseId)}`),
      albumReleases: (albumId: string) =>
        get<T.AlbumReleases>(`/catalog/albums/${id(albumId)}/releases`),
      albumExternalVersions: (albumId: string, page = 1) =>
        get<T.ExternalSearchPage>(`/catalog/albums/${id(albumId)}/external-versions`, { page }),
      trackLinks: (trackId: string) => get<T.TrackLinks>(`/catalog/tracks/${id(trackId)}/links`),
      searchExternal: (query: Partial<CatalogSearchQuery>) =>
        get<T.ExternalSearchPage>('/catalog/external/search', query as Query),
      externalRelease: (discogsId: number | string) =>
        get<unknown>(`/catalog/external/releases/${id(String(discogsId))}`),
      masterVersions: (masterId: number | string, page = 1) =>
        get<T.ExternalSearchPage>(`/catalog/external/masters/${id(String(masterId))}/versions`, {
          page,
        }),
      identifyBarcode: (barcode: string) =>
        post<T.IdentifyResult & { attribution: string }>('/catalog/identify/barcode', { barcode }),
      identifyPhoto: (
        images: {
          data: string;
          mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        }[],
      ) => post<T.IdentifyResult & { attribution: string }>('/catalog/identify/photo', { images }),
    },
    search: (q: string, limit = 10) => get<T.SearchResults>('/search', { q, limit }),
    stats: {
      dashboard: () => get<T.Dashboard>('/dashboard'),
      summary: () => get<T.StatsSummary>('/stats/summary'),
      breakdowns: () => get<T.StatsBreakdowns>('/stats/breakdowns'),
      timeline: () => get<T.StatsTimeline>('/stats/timeline'),
    },
    achievements: {
      list: () => get<T.Achievement[]>('/achievements'),
      essentials: () => get<T.EssentialProgress[]>('/achievements/essentials'),
    },
    discover: () => get<T.Insight[]>('/discover'),
    imports: {
      startDiscogs: (username: string) =>
        post<{ username: string; total: number; queued: number; status: T.ImportStatus }>(
          '/imports/discogs',
          { username },
        ),
      runBatch: () =>
        post<{ done: number; failed: number; retried: number; status: T.ImportStatus }>(
          '/imports/discogs/run',
        ),
      status: () => get<T.ImportStatus>('/imports/discogs'),
    },
    public: {
      profile: (username: string) => get<T.PublicProfile>(`/public/users/${id(username)}`),
      collection: (username: string, query: Partial<CollectionQuery> = {}) =>
        get<T.PublicCollection>(`/public/users/${id(username)}/collection`, query as Query),
    },
    /** PUT a file to a presigned upload target. */
    upload: async (target: T.UploadTarget, file: Blob) => {
      const res = await f(target.uploadUrl, {
        method: target.method,
        headers: target.headers,
        body: file,
      });
      if (!res.ok)
        throw new ApiError(res.status, 'UPSTREAM_UNAVAILABLE', 'No se pudo subir la imagen.');
      return target.publicUrl;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function statusCode(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'INTERNAL';
  return 'VALIDATION';
}
