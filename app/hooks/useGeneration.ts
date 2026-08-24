"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GEN_CONCURRENCY } from "@/lib/models";
import type { ModelSpec, SessionItem } from "@/lib/types";

export interface GenTask {
  taskId: string; // placeholder id (UI key)
  prompt: string;
  stage: "queued" | "generating" | "error";
  errorMsg?: string;
}

export interface GenParams {
  model: ModelSpec;
  prompts: string[];
  imageUrls: string[];
  aspectRatio: string;
  resolution: string;
  outputFormat?: string;
  duration?: number;
  mode?: string;
  generateAudio?: boolean;
  nsfwChecker?: boolean;
  webSearch?: boolean;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  videoUrls?: string[];
  audioUrls?: string[];
}

const POLL_INTERVAL_MS = 2500;
const MAX_CONSECUTIVE_FAILS = 3; // tolerate transient errors over long (video) jobs
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Worker-pool generation. Every prompt becomes a job; up to GEN_CONCURRENCY jobs
 * run at once and the rest wait as "queued". When a job settles (success/fail) the
 * worker pulls the next one — so a 100-prompt batch drains 20-at-a-time.
 *
 * Each job: create one Kie task (/api/create-tasks with a single prompt) then poll
 * /api/poll-task until success/failed. Polling is a sequential await-loop per job,
 * so two polls for the same task can never overlap (no settle-twice key crashes).
 */
export function useGeneration(onComplete: (item: SessionItem) => void) {
  const [tasks, setTasks] = useState<GenTask[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const aliveRef = useRef(true); // false after unmount -> workers exit
  const cancelledRef = useRef<Set<string>>(new Set()); // dismissed task ids

  useEffect(() => () => { aliveRef.current = false; }, []);

  const patchTask = useCallback(
    (id: string, patch: Partial<GenTask>) =>
      setTasks((prev) => prev.map((t) => (t.taskId === id ? { ...t, ...patch } : t))),
    []
  );
  const removeTask = useCallback(
    (id: string) => setTasks((prev) => prev.filter((t) => t.taskId !== id)),
    []
  );

  const dismiss = useCallback(
    (placeholderId: string) => {
      cancelledRef.current.add(placeholderId);
      removeTask(placeholderId);
    },
    [removeTask]
  );

  const generate = useCallback(async (p: GenParams) => {
    const { model } = p;
    if (p.prompts.length === 0) return;

    // Freeze the settings that describe THIS batch right now.
    const settingsSnapshot: SessionItem["settings"] = {
      aspect_ratio: p.aspectRatio,
      resolution: p.resolution,
      ...(model.formats ? { format: p.outputFormat ?? "png" } : {}),
      ...(model.modality === "video"
        ? { duration: p.duration ?? 0, ...(p.mode ? { mode: p.mode } : {}), ...(model.extras?.audio ? { audio: !!p.generateAudio } : {}) }
        : {}),
    };
    const fileExt = model.modality === "video" ? "mp4" : p.outputFormat ?? "png";

    const jobs = p.prompts.map((prompt) => ({ id: crypto.randomUUID(), prompt }));
    setTasks((prev) => [
      ...jobs.map((j) => ({ taskId: j.id, prompt: j.prompt, stage: "queued" as const })),
      ...prev,
    ]);
    setProgress({ done: 0, total: jobs.length });

    const isCancelled = (id: string) => !aliveRef.current || cancelledRef.current.has(id);
    const bumpDone = () => setProgress((pr) => (pr ? { ...pr, done: pr.done + 1 } : pr));

    const runOne = async (job: { id: string; prompt: string }) => {
      if (isCancelled(job.id)) return;
      patchTask(job.id, { stage: "generating" });

      let kieTaskId: string;
      try {
        const res = await fetch("/api/create-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model.id,
            prompts: [job.prompt],
            aspectRatio: p.aspectRatio,
            resolution: p.resolution,
            outputFormat: p.outputFormat,
            imageUrls: p.imageUrls,
            duration: p.duration,
            mode: p.mode,
            generateAudio: p.generateAudio,
            nsfwChecker: p.nsfwChecker,
            webSearch: p.webSearch,
            firstFrameUrl: p.firstFrameUrl,
            lastFrameUrl: p.lastFrameUrl,
            videoUrls: p.videoUrls,
            audioUrls: p.audioUrls,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? "Failed to create task");
        const created = data.tasks?.[0];
        if (!created?.kieTaskId || created.error) throw new Error(created?.error ?? "Failed to queue");
        kieTaskId = created.kieTaskId;
      } catch (err) {
        if (isCancelled(job.id)) return;
        patchTask(job.id, { stage: "error", errorMsg: err instanceof Error ? err.message : "Failed to queue" });
        bumpDone();
        return;
      }

      let fails = 0;
      for (;;) {
        if (isCancelled(job.id)) return;
        await sleep(POLL_INTERVAL_MS);
        if (isCancelled(job.id)) return;
        try {
          const pollRes = await fetch(`/api/poll-task?kieTaskId=${kieTaskId}`);
          const pollData = await pollRes.json();
          fails = 0;
          if (pollData.state === "success") {
            if (isCancelled(job.id)) return;
            removeTask(job.id);
            onCompleteRef.current({
              id: job.id,
              kind: model.modality,
              prompt: job.prompt,
              mediaUrl: pollData.mediaUrl ?? pollData.imageUrl,
              settings: { ...settingsSnapshot, ext: fileExt },
              timestamp: Date.now(),
            });
            bumpDone();
            return;
          }
          if (pollData.state === "failed") {
            if (isCancelled(job.id)) return;
            patchTask(job.id, { stage: "error", errorMsg: "Generation failed" });
            bumpDone();
            return;
          }
          // pending -> keep polling
        } catch {
          if (++fails >= MAX_CONSECUTIVE_FAILS) {
            if (isCancelled(job.id)) return;
            patchTask(job.id, { stage: "error", errorMsg: "Lost connection" });
            bumpDone();
            return;
          }
        }
      }
    };

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        if (!aliveRef.current) return;
        await runOne(jobs[cursor++]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(GEN_CONCURRENCY, jobs.length) }, worker));
    if (aliveRef.current) setProgress(null);
  }, [patchTask, removeTask]);

  return { tasks, progress, generate, dismiss };
}
