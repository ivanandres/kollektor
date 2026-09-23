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
  isOwnPublicUrl(url: string): boolean;
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

  isOwnPublicUrl(url: string): boolean {
    return url.startsWith(`${this.cfg.publicBaseUrl.replace(/\/$/, '')}/`);
  }
}
