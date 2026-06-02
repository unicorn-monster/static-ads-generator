// Thin Kie AI client. Single provider — see ADR-0001.

const KIE_BASE_URL = "https://api.kie.ai/api/v1/jobs";

/** Create a Kie task, returns the taskId. Retries on 429 (3 attempts, exp backoff). */
export async function createKieTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>
): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const resp = await fetch(`${KIE_BASE_URL}/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }),
    });

    if (resp.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }
    if (!resp.ok) throw new Error(`Kie API error ${resp.status}: ${await resp.text()}`);

    const data = await resp.json();
    const taskId = data.taskId ?? data.data?.taskId;
    if (!taskId) throw new Error("No taskId in Kie API response");
    return taskId as string;
  }
  throw new Error("Failed to create task after retries");
}

export type PollResult =
  | { state: "success"; mediaUrl: string | null }
  | { state: "failed"; error: string }
  | { state: "pending" };

/**
 * Poll a Kie task via /recordInfo (model-agnostic — works for image + video).
 * Throws on transport/HTTP error so the caller can decide retry/tolerance (see FIX #1 client-side).
 *
 * FIX #2: video result-URL shape is parsed defensively across several field names. The exact field
 * for Seedance/Grok is still UNVERIFIED — gen one clip and log raw `record` to confirm before trusting.
 */
export async function pollKieTask(apiKey: string, taskId: string): Promise<PollResult> {
  const resp = await fetch(`${KIE_BASE_URL}/recordInfo?taskId=${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`Kie API error ${resp.status}`);

  const data = await resp.json();
  const record = "state" in data ? data : data.data ?? {};
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
      resultJson?.videoUrls ??
      resultJson?.urls ??
      [];
    const mediaUrl: string | null =
      urls[0] ??
      resultJson?.videoUrl ??
      resultJson?.video_url ??
      resultJson?.resultUrl ??
      resultJson?.url ??
      record.output?.imageUrl ??
      record.imageUrl ??
      record.image_url ??
      null;
    return { state: "success", mediaUrl };
  }

  if (["fail", "failed", "error"].includes(state)) {
    return { state: "failed", error: "Generation failed" };
  }
  return { state: "pending" };
}
