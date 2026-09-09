export type PhotoMeta = {
  capturedAt: string | null;
  lat: number | null;
  lng: number | null;
};

export type Optimized = {
  blob: Blob;
  mime: string;
  ext: string;
  width: number;
  height: number;
  hash: string;
  meta: PhotoMeta;
};

const MAX_DIM = 2000;

/** Read capture time + GPS from a JPEG's EXIF block. Absent for most other formats. */
export async function readExif(file: File): Promise<PhotoMeta> {
  const empty: PhotoMeta = { capturedAt: null, lat: null, lng: null };
  try {
    const head = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    if (head.byteLength < 4 || head.getUint16(0) !== 0xffd8) return empty;

    let offset = 2;
    let tiff = -1;
    while (offset + 4 < head.byteLength) {
      if (head.getUint8(offset) !== 0xff) break;
      const marker = head.getUint8(offset + 1);
      const size = head.getUint16(offset + 2);
      if (marker === 0xe1 && head.getUint32(offset + 4) === 0x45786966) {
        tiff = offset + 10;
        break;
      }
      offset += 2 + size;
    }
    if (tiff < 0) return empty;

    const little = head.getUint16(tiff) === 0x4949;
    const u16 = (p: number) => head.getUint16(p, little);
    const u32 = (p: number) => head.getUint32(p, little);

    let captured: string | null = null;
    let lat: number | null = null;
    let lng: number | null = null;

    const rational = (p: number) => u32(p) / (u32(p + 4) || 1);
    const dms = (p: number) => rational(p) + rational(p + 8) / 60 + rational(p + 16) / 3600;
    const ascii = (p: number, len: number) => {
      let s = "";
      for (let i = 0; i < len - 1; i++) s += String.fromCharCode(head.getUint8(p + i));
      return s;
    };

    const walk = (dir: number, gps: boolean) => {
      if (dir + 2 > head.byteLength) return;
      const count = u16(dir);
      for (let i = 0; i < count; i++) {
        const e = dir + 2 + i * 12;
        if (e + 12 > head.byteLength) return;
        const tag = u16(e);
        const len = u32(e + 4);
        const valOff = len > 4 ? tiff + u32(e + 8) : e + 8;
        if (!gps && (tag === 0x9003 || tag === 0x0132) && !captured && len >= 19) {
          const s = ascii(valOff, len);
          const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
          if (m) captured = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
        }
        if (!gps && tag === 0x8769) walk(tiff + u32(e + 8), false);
        if (!gps && tag === 0x8825) walk(tiff + u32(e + 8), true);
        if (gps && tag === 0x0002) lat = dms(valOff);
        if (gps && tag === 0x0004) lng = dms(valOff);
        if (gps && tag === 0x0001 && ascii(e + 8, 2) === "S" && lat !== null) lat = -lat;
        if (gps && tag === 0x0003 && ascii(e + 8, 2) === "W" && lng !== null) lng = -lng;
      }
    };

    walk(tiff + u32(tiff + 4), false);
    return { capturedAt: captured, lat, lng };
  } catch {
    return empty;
  }
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscale to <= 2000px, re-encode as WebP (JPEG fallback) and fingerprint.
 * Re-drawing through a canvas also drops EXIF and other metadata, so we read
 * what we need from the original first.
 */
export async function optimizePhoto(file: File): Promise<Optimized> {
  const meta = await readExif(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let mime = "image/webp";
  let blob = await encode(canvas, mime, 0.82);
  if (!blob || blob.type !== "image/webp") {
    mime = "image/jpeg";
    blob = await encode(canvas, mime, 0.82);
  }
  if (!blob) throw new Error("Could not prepare that photo.");

  return {
    blob,
    mime,
    ext: mime === "image/webp" ? "webp" : "jpg",
    width,
    height,
    hash: await sha256(blob),
    meta: {
      capturedAt: meta.capturedAt ?? new Date(file.lastModified || Date.now()).toISOString(),
      lat: meta.lat,
      lng: meta.lng,
    },
  };
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}
