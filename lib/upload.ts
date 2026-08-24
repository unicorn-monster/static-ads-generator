// Client-side upload. Everything goes straight to Cloudinary with a server-signed
// request: a Vercel serverless request body caps at 4.5MB, well under Kie's own
// limits (30MB per image, 50MB per reference video, 15MB per reference audio).

export interface UploadedFile {
  filename: string;
  url: string;
}

/** Kie's per-file ceilings, in bytes. */
export const MAX_BYTES = {
  image: 30 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 15 * 1024 * 1024,
};

/** Upload one file to Cloudinary. Audio is stored under Cloudinary's "video" resource type. */
export async function uploadFile(file: File, kind: keyof typeof MAX_BYTES): Promise<UploadedFile> {
  if (file.size > MAX_BYTES[kind]) {
    throw new Error(`${file.name} vượt ${MAX_BYTES[kind] / 1024 / 1024}MB`);
  }

  const signRes = await fetch("/api/upload-sign", { method: "POST" });
  if (!signRes.ok) {
    const detail = (await signRes.json().catch(() => ({}))).detail;
    throw new Error(detail ?? "Không lấy được chữ ký upload");
  }
  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const fd = new FormData();
  fd.append("file", file);
  fd.append("api_key", apiKey);
  fd.append("timestamp", String(timestamp));
  fd.append("folder", folder);
  fd.append("signature", signature);

  const resourceType = kind === "image" ? "image" : "video";
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))).error?.message;
    throw new Error(detail ?? `Upload failed (${res.status})`);
  }
  const data = await res.json();
  return { filename: file.name, url: data.secure_url as string };
}
