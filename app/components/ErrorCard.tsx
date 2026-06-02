export function ErrorCard({ onDismiss, message }: { onDismiss?: () => void; message?: string }) {
  return (
    <div className="rounded overflow-hidden bg-slate-900 shadow-sm border-[1.5px] border-red-500/50">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-red-500/15 text-red-400">
          ✕ {message ?? "Failed"}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="h-5 w-5 rounded-full bg-slate-800 text-slate-500 hover:bg-slate-700 text-xs flex items-center justify-center cursor-pointer"
          >
            &times;
          </button>
        )}
      </div>
      <div className="aspect-square w-full bg-red-500/5 flex items-center justify-center">
        <svg className="h-10 w-10 text-red-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <div className="p-3">
        <div className="h-9 rounded-lg bg-red-500/5" />
      </div>
    </div>
  );
}
