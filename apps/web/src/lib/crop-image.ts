/** Pixel-space crop rectangle emitted by react-easy-crop's `onCropComplete`. */
export type CropArea = { x: number; y: number; width: number; height: number };

/** Output edge length for the rendered avatar — square, downscaled. */
const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    // The source is an object URL for a locally-picked file, so CORS doesn't
    // apply — but set it defensively so a future remote source can't taint the
    // canvas and block toBlob.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the selected image.'));
    img.src = src;
  });
}

/**
 * Crops `src` to `area` and returns a square WebP blob no larger than
 * OUTPUT_SIZE per edge. Used by AvatarCropDialog to turn the user's
 * pan/zoom selection into the bytes we actually upload — so storage holds
 * the cropped avatar, not the full original.
 */
export async function cropImageToBlob(src: string, area: CropArea): Promise<Blob> {
  const image = await loadImage(src);

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable in this browser.');

  // Draw the selected source rectangle into the full output square. The
  // crop area is already square (aspect locked to 1 in the cropper), so the
  // aspect ratio is preserved while downscaling to OUTPUT_SIZE.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the cropped image.'))),
      'image/webp',
      0.9,
    );
  });
}
