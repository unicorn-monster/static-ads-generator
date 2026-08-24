import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

// Reference videos (≤50MB) and audio (≤15MB) can't go through /api/upload: a Vercel
// serverless request body caps at 4.5MB. The browser posts them straight to Cloudinary
// with this signature instead.
export async function POST() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return NextResponse.json({ detail: "Cloudinary not configured" }, { status: 500 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "kie-uploads";
  const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, CLOUDINARY_API_SECRET);

  return NextResponse.json({
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature,
  });
}
