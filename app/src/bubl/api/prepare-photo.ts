// Turns a picked photo into something /api/media/upload accepts: HEIC/HEIF
// (iPhone) and oversized photos are re-encoded as JPEG, at most 2048 px on the
// long side. Re-encoding through a canvas also drops all metadata.
// Browsers that can't decode a file (e.g. HEIC outside Safari) get the
// original back, and the server answers with a clear "unsupported" error.

const MAX_SIDE_PX = 2048;
const JPEG_QUALITY = 0.85;
const KEEP_AS_IS_BYTES = 4 * 1024 * 1024;
const SERVER_FORMATS = new Set(['image/jpeg', 'image/png', 'image/webp']);

const isHeic = (file: File) => /^image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

export async function preparePhoto(file: File): Promise<File> {
  const isPhoto = file.type.startsWith('image/') || isHeic(file);
  if (!isPhoto) return file;
  if (SERVER_FORMATS.has(file.type) && !isHeic(file) && file.size <= KEEP_AS_IS_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
