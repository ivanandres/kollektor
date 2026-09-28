import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1568;

/** Downscales a photo to a JPEG the identify endpoint accepts (base64, no data: prefix). */
export async function toIdentifyImage(uri: string, width?: number, height?: number) {
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && Math.max(width, height) > MAX_SIDE) {
    ctx.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ base64: true, compress: 0.82, format: SaveFormat.JPEG });
  return { data: out.base64 ?? '', mediaType: 'image/jpeg' as const };
}
