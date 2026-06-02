import { NextResponse } from "next/server";
import { pollKieTask } from "@/lib/kie";

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

  try {
    const result = await pollKieTask(apiKey, kieTaskId);
    if (result.state === "success") {
      // Keep `imageUrl` for backward-compat with current page.tsx; add `mediaUrl` for new pages.
      return NextResponse.json({
        state: "success",
        imageUrl: result.mediaUrl,
        mediaUrl: result.mediaUrl,
      });
    }
    if (result.state === "failed") {
      return NextResponse.json({ state: "failed", error: result.error });
    }
    return NextResponse.json({ state: "pending" });
  } catch (e) {
    return NextResponse.json(
      { detail: e instanceof Error ? e.message : "poll error" },
      { status: 502 }
    );
  }
}
