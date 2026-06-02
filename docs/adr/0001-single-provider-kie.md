# Single provider (Kie AI), no provider abstraction

We route every model — image and video, current and future (Veo, Kling, Sora, etc.) — through **Kie AI as the sole upstream provider**, and we deliberately do **not** build a provider-abstraction layer (no `IProvider`, no provider factory). Kie already unifies dozens of underlying models behind one `createTask`/poll API, so the only axis that actually varies is the **Model** and its **Modality**, not the provider. Building a provider interface for a single provider would be speculative abstraction (cf. the project's "no abstractions for single-use code" rule).

The variation we _do_ abstract is per-model request shaping: a capability-driven **ModelSpec** registry (`lib/models.ts`) plus a thin Kie client (`lib/kie.ts`) that resolves a Model + reference-image presence into a **Kie model ID** and request body.

## Considered options

- **Provider abstraction (`IProvider` + factory)** — rejected. Only one provider exists and the design intent is to keep it that way; the interface would have exactly one implementation indefinitely.
- **Direct per-vendor APIs (fal.ai, Replicate, vendor SDKs)** — rejected. Kie's price (~30–80% below official) and single-integration surface are the whole reason this tool exists.

## Consequences

- If a genuine second provider is ever required, extract the abstraction _then_ — with two concrete cases in hand, the refactor is small and correct, versus guessing now.
- All retention/expiry behaviour is bounded by Kie's limits (output URLs ~24h, files ≤14 days). Durable history would require re-hosting outputs ourselves; explicitly out of scope for v1.
