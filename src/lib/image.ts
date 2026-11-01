/** Загрузка картинки профиля: до 4 МБ, PNG / JPEG / WebP. */
export const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Потолок data-URL картинки профиля: 256×256 в webp весит единицы килобайт. */
export const IMAGE_MAX_DATA_URL = 150 * 1024;

/**
 * Картинка из хранилища или архива копии: только свой data-URL, не чужой адрес.
 * Внешняя ссылка в `<img>` заставила бы браузер сходить по ней при показе
 * (слежка по IP), а подложенный архив мог её принести.
 */
export function safeImageUrl(v: unknown): string | undefined {
  return typeof v === "string" &&
    v.length <= IMAGE_MAX_DATA_URL &&
    /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(v)
    ? v
    : undefined;
}

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
    // Safari без webp отдаёт PNG, а он может не влезть в потолок — тогда jpeg.
    let url = canvas.toDataURL("image/webp", 0.85);
    if (url.length > IMAGE_MAX_DATA_URL) url = canvas.toDataURL("image/jpeg", 0.8);
    return url.length > IMAGE_MAX_DATA_URL ? { error: "size" } : { url };
  } catch {
    return { error: "read" };
  }
}
