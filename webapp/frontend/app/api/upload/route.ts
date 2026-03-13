import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

export const maxDuration = 60;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 30 * 1024 * 1024;

function uploadToCloudinary(buffer: Buffer): Promise<{ secure_url: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "kie-uploads", resource_type: "image" }, (error, result) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string });
      })
      .end(buffer);
  });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ detail: "No files provided" }, { status: 400 });
  }
  if (files.length > 14) {
    return NextResponse.json({ detail: "Maximum 14 files allowed" }, { status: 400 });
  }

  try {
    const results = await Promise.all(
      files.map(async (file) => {
        if (!ALLOWED_TYPES.has(file.type)) {
          throw new Error(`Unsupported type: ${file.type}. Use JPEG, PNG, or WEBP.`);
        }
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength > MAX_SIZE) {
          throw new Error(`File exceeds 30MB limit`);
        }
        const buffer = Buffer.from(bytes);
        const result = await uploadToCloudinary(buffer);
        return { filename: file.name, url: result.secure_url };
      })
    );
    return NextResponse.json(results);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ detail: msg }, { status: 400 });
  }
}
