import { NextResponse } from "next/server";

const KIE_BASE_URL = "https://api.kie.ai/api/v1/jobs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kieTaskId = searchParams.get("kieTaskId");

  if (!kieTaskId) {
    return NextResponse.json({ detail: "kieTaskId is required" }, { status: 400 });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ detail: "KIE_API_KEY not configured" }, { status: 500 });
  }

  const resp = await fetch(`${KIE_BASE_URL}/recordInfo?taskId=${kieTaskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    return NextResponse.json({ detail: `Kie API error ${resp.status}` }, { status: 502 });
  }

  const data = await resp.json();
  const record = "state" in data ? data : (data.data ?? {});
  const state = String(record.state ?? "").toLowerCase();

  if (state === "success") {
    let resultJson = record.resultJson;
    if (typeof resultJson === "string") {
      try {
        resultJson = JSON.parse(resultJson);
      } catch {
        resultJson = null;
      }
    }
    const urls: string[] =
      resultJson?.resultUrls ??
      record.resultUrls ??
      [];

    const imageUrl: string | null =
      urls[0] ??
      record.output?.imageUrl ??
      record.imageUrl ??
      record.image_url ??
      null;

    return NextResponse.json({ state: "success", imageUrl });
  }

  if (["fail", "failed", "error"].includes(state)) {
    return NextResponse.json({ state: "failed", error: "Generation failed" });
  }

  return NextResponse.json({ state: "pending" });
}
