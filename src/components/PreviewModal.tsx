"use client";

type PreviewModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider modal (e.g. PDF preview). */
  wide?: boolean;
};

export function PreviewModal({
  open,
  title,
  onClose,
  children,
  wide = false,
}: PreviewModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:rounded-2xl ${
          wide ? "max-w-5xl" : "max-w-3xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="truncate pr-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
