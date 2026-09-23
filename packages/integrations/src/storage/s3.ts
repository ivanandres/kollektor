import { AwsClient } from 'aws4fetch';

export interface UploadTarget {
  uploadUrl: string;
  publicUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresIn: number;
}

export interface StorageService {
  /** Presigned URL the client uploads to directly (the file never passes through our API). */
  createUpload(key: string, contentType: string): Promise<UploadTarget>;
  /** Object key for one of our public URLs (no query/fragment tricks), otherwise null. */
  keyFromPublicUrl(url: string): string | null;
  /** Size in bytes, or null if the object doesn't exist. */
  size(key: string): Promise<number | null>;
  delete(key: string): Promise<void>;
}

/** Any S3-compatible bucket: Cloudflare R2 (default), AWS S3, MinIO on a VPS… */
export class S3StorageService implements StorageService {
  private readonly client: AwsClient;

  constructor(
    private readonly cfg: {
      endpoint: string; // e.g. https://<account>.r2.cloudflarestorage.com
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string; // e.g. https://media.kollektor.app
      region?: string;
      expiresIn?: number;
    },
  ) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: 's3',
      region: cfg.region ?? 'auto',
    });
  }

  async createUpload(key: string, contentType: string): Promise<UploadTarget> {
    const expiresIn = this.cfg.expiresIn ?? 600;
    const url = new URL(`${this.cfg.endpoint.replace(/\/$/, '')}/${this.cfg.bucket}/${key}`);
    url.searchParams.set('X-Amz-Expires', String(expiresIn));
    const signed = await this.client.sign(url.toString(), {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      aws: { signQuery: true },
    });
    return {
      uploadUrl: signed.url,
      publicUrl: `${this.cfg.publicBaseUrl.replace(/\/$/, '')}/${key}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      expiresIn,
    };
  }

  keyFromPublicUrl(url: string): string | null {
    let parsed: URL;
    let base: URL;
    try {
      parsed = new URL(url);
      base = new URL(this.cfg.publicBaseUrl.replace(/\/?$/, '/'));
    } catch {
      return null;
    }
    if (parsed.origin !== base.origin || parsed.search || parsed.hash) return null;
    if (!parsed.pathname.startsWith(base.pathname)) return null;
    let key: string;
    try {
      key = decodeURIComponent(parsed.pathname.slice(base.pathname.length));
    } catch {
      return null; // malformed escapes ("%E0")
    }
    return key && !key.split('/').includes('..') ? key : null;
  }

  private objectUrl(key: string) {
    return `${this.cfg.endpoint.replace(/\/$/, '')}/${this.cfg.bucket}/${key}`;
  }

  async size(key: string): Promise<number | null> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'HEAD' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage HEAD failed: ${res.status}`);
    return Number(res.headers.get('content-length') ?? 0);
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`Storage DELETE failed: ${res.status}`);
  }
}
