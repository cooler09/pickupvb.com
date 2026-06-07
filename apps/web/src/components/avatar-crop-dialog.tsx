'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { cropImageToBlob } from '@/lib/crop-image';
import { primaryButtonClass, secondaryButtonClass } from './primary-button';

type Props = {
  /** Object URL of the locally-picked image, or null when the dialog is closed. */
  imageSrc: string | null;
  /** Crop selection shape — `'round'` (default) for people, `'rect'` for group
   *  logos. The output blob is always a square WebP either way; this only
   *  changes the in-dialog selection mask. */
  cropShape?: 'round' | 'rect';
  /** Called with the cropped square (WebP) when the user confirms. */
  onConfirm: (blob: Blob) => Promise<void> | void;
  /** Called when the user cancels or dismisses without cropping. */
  onCancel: () => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

/**
 * Controlled crop dialog for the avatar flow. Built directly on
 * `@radix-ui/react-dialog` (the same primitive as FormModal) rather than
 * FormModal itself, because its open state is driven by file selection — not
 * a trigger button — so it needs a controlled `open` boolean.
 *
 * Hosts react-easy-crop with a round, aspect-locked (1:1) selection plus a
 * zoom slider. On confirm it renders the selection to a square WebP blob
 * (see cropImageToBlob) and hands it to `onConfirm`; the parent uploads that
 * blob, so storage holds the cropped avatar rather than the full original.
 */
export function AvatarCropDialog({ imageSrc, cropShape = 'round', onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setAreaPixels(pixels);
  }, []);

  // Reset transient crop state whenever the dialog closes so the next image
  // starts centered at 1× rather than inheriting the previous selection.
  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setAreaPixels(null);
    setError(null);
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  async function handleConfirm() {
    if (!imageSrc || !areaPixels) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await cropImageToBlob(imageSrc, areaPixels);
      await onConfirm(blob);
      reset();
    } catch {
      setError('Could not crop the image. Please try a different photo.');
      setSaving(false);
    }
  }

  return (
    <RadixDialog.Root
      open={imageSrc !== null}
      onOpenChange={(open) => {
        if (!open && !saving) handleCancel();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="md-dialog-overlay fixed inset-0 z-50 bg-black/50" />
        <RadixDialog.Content
          className="md-dialog-motion border-border-base bg-md-surface-container text-fg shadow-elevation-3 rounded-shape-lg fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 border p-0"
          onInteractOutside={(e) => {
            if (saving) e.preventDefault();
          }}
        >
          <div className="space-y-4 p-5">
            <header className="space-y-1">
              <RadixDialog.Title className="text-base font-semibold">
                Crop your photo
              </RadixDialog.Title>
              <RadixDialog.Description className="text-muted text-sm">
                Drag to reposition and use the slider to zoom.
              </RadixDialog.Description>
            </header>

            <div className="bg-fg/5 rounded-shape-sm relative h-64 w-full overflow-hidden">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape={cropShape}
                  showGrid={false}
                  minZoom={MIN_ZOOM}
                  maxZoom={MAX_ZOOM}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>

            <label className="flex items-center gap-3">
              <span className="text-muted text-xs font-medium">Zoom</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom"
                className="accent-primary h-1 flex-1 cursor-pointer"
              />
            </label>

            {error && <p className="text-destructive text-xs">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className={secondaryButtonClass('sm')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={saving || !areaPixels}
                className={primaryButtonClass('sm')}
              >
                {saving ? 'Saving…' : 'Save photo'}
              </button>
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
