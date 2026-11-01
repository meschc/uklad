/** Загрузка картинки профиля: до 4 МБ, PNG / JPEG / WebP. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export type ImageError = "type" | "size" | "read";

/**
 * Уменьшает картинку до квадрата со стороной `side` (по центру, без искажений)
 * и отдаёт data-URL. В хранилище уходит маленький файл, а не оригинал с
 * телефона на несколько мегабайт.
 */
export async function imageToDataUrl(
  file: File,
  side = 256,
): Promise<{ url: string } | { error: ImageError }> {
  if (!IMAGE_TYPES.includes(file.type)) return { error: "type" };
  if (file.size > IMAGE_MAX_BYTES) return { error: "size" };
  try {
    const bitmap = await createImageBitmap(file);
    const crop = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "read" };
    ctx.drawImage(
      bitmap,
      (bitmap.width - crop) / 2,
      (bitmap.height - crop) / 2,
      crop,
      crop,
      0,
      0,
      side,
      side,
    );
    bitmap.close();
    return { url: canvas.toDataURL("image/webp", 0.85) };
  } catch {
    return { error: "read" };
  }
}
