import { DomainError } from '@kollektor/core';
import type { StorageService } from '@kollektor/integrations';

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type ImageType = keyof typeof IMAGE_TYPES;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function requireStorage(storage: StorageService | undefined): StorageService {
  if (!storage)
    throw new DomainError('NOT_CONFIGURED', 'El almacenamiento de imágenes no está configurado');
  return storage;
}

/**
 * Validates that a URL points to an object we issued under `prefix` and that the uploaded file
 * is within the size limit (presigned PUTs can't bound size). Oversized files are deleted.
 */
export async function verifyUploadedImage(
  storage: StorageService,
  url: string,
  prefix: string,
): Promise<string> {
  const key = storage.keyFromPublicUrl(url);
  if (!key || !key.startsWith(prefix))
    throw new DomainError('VALIDATION', 'Subí la imagen con el endpoint de subida');
  const size = await storage.size(key);
  if (size == null) throw new DomainError('VALIDATION', 'No encontramos la imagen subida');
  if (size > MAX_IMAGE_BYTES) {
    await storage.delete(key);
    throw new DomainError('VALIDATION', 'La imagen debe pesar menos de 5 MB');
  }
  return key;
}
