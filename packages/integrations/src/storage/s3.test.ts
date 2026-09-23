import { describe, expect, it } from 'vitest';
import { S3StorageService } from './s3';

describe('S3StorageService', () => {
  it('creates a presigned PUT url and a public url', async () => {
    const s = new S3StorageService({
      endpoint: 'https://acc.r2.cloudflarestorage.com',
      bucket: 'kollektor',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
      publicBaseUrl: 'https://media.example.com/',
    });
    const t = await s.createUpload('avatars/u1/abc.jpg', 'image/jpeg');
    const u = new URL(t.uploadUrl);
    expect(u.pathname).toBe('/kollektor/avatars/u1/abc.jpg');
    expect(u.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(u.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(t.publicUrl).toBe('https://media.example.com/avatars/u1/abc.jpg');
    expect(s.keyFromPublicUrl(t.publicUrl)).toBe('avatars/u1/abc.jpg');
    expect(s.keyFromPublicUrl('https://evil.example.com/x.jpg')).toBeNull();
    expect(
      s.keyFromPublicUrl('https://media.example.com/avatars/other/x.png?/copies/u1/'),
    ).toBeNull();
    expect(s.keyFromPublicUrl('https://media.example.com/a/../b.png')).toBe('b.png'); // URL normalizes ..
  });
});
