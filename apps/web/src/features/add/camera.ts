'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'starting' | 'live' | 'denied' | 'unavailable';

/** Rear camera stream for the viewfinder; stops when the component unmounts. */
export function useCamera(active: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    setState('starting');
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setState('live');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState(
          e instanceof DOMException && e.name === 'NotAllowedError' ? 'denied' : 'unavailable',
        );
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [active]);

  /** Current frame as a JPEG blob. */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const v = video.current;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
  }, []);

  return { video, state, capture };
}

const MAX_SIDE = 1568;

/** Downscale any picked image to a JPEG the identify endpoint accepts. */
export async function toJpeg(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.85),
  );
}

export async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** Native barcode reader (Chrome/Android); null where the browser lacks it (use manual entry). */
export function barcodeDetector(): Detector | null {
  const Ctor = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
  } catch {
    return null;
  }
}
