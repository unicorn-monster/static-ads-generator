export function ProcessingCard({ label = "Processing...", queued = false }: { label?: string; queued?: boolean }) {
  if (queued) {
    return (
      <div className="rounded overflow-hidden bg-slate-900 shadow-sm border-[1.5px] border-slate-700/60 opacity-60">
        <div className="px-3 pt-3 pb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-700/40 text-slate-400">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
            Queued
          </span>
        </div>
        <div className="aspect-square w-full bg-slate-800/60" />
        <div className="p-3">
          <div className="h-9 rounded-lg bg-slate-800" />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded overflow-hidden bg-slate-900 shadow-sm border-[1.5px] border-yellow-500/50">
      <div className="px-3 pt-3 pb-1">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-yellow-500/15 text-yellow-400">
          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          {label}
        </span>
      </div>
      <div className="skeleton aspect-square w-full" />
      <div className="p-3">
        <div className="h-9 rounded-lg bg-slate-800" />
      </div>
    </div>
  );
}
