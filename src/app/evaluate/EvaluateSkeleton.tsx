import {
  evaluateCardClass,
  evaluateContainerClass,
  evaluateGridClass,
  evaluatePageClass,
} from "./evaluateStyles";

/** Form area skeleton — same grid, card size, and padding as loaded UI. */
export function EvaluateFormSkeleton() {
  const bar = "rounded-md bg-zinc-200/90 animate-pulse motion-reduce:animate-none dark:bg-zinc-700/50";
  const row = "rounded-lg bg-zinc-100 animate-pulse motion-reduce:animate-none dark:bg-zinc-800/80";
  const line = `${bar} h-3`;

  return (
    <div className={evaluateGridClass}>
      <section className={evaluateCardClass} aria-hidden>
        <div className={`h-3 w-40 ${bar}`} />
        <div className={`mt-6 h-11 w-full rounded-xl ${row}`} />
        <div className="mt-auto pt-8">
          <div className={`h-3 max-w-[85%] ${line}`} />
          <div className={`mt-2 h-3 max-w-[60%] ${line}`} />
        </div>
      </section>

      <section className={evaluateCardClass} aria-hidden>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={`h-3 w-24 ${bar}`} />
          <div className="flex gap-3">
            <div className={`h-3 w-16 ${bar}`} />
            <div className={`h-3 w-14 ${bar}`} />
          </div>
        </div>
        <div className="mt-5 flex min-h-[18rem] max-h-80 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/90 shadow-inner dark:border-zinc-800 dark:bg-zinc-900/35">
          <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/90">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                <div className={`h-4 w-4 shrink-0 rounded ${row}`} />
                <div className={`size-10 shrink-0 rounded-xl ${row}`} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className={`h-3.5 max-w-[12rem] ${bar} w-[60%]`} />
                  <div className={`h-3 max-w-[9rem] ${bar} w-[45%]`} />
                  <div className={`h-3 max-w-[16rem] ${bar} w-[85%]`} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** Full-page skeleton for `loading.tsx` — mirrors header, intro card, grid, and action row. */
export function EvaluatePageSkeleton() {
  const bar =
    "rounded-lg bg-zinc-200/90 animate-pulse motion-reduce:animate-none dark:bg-zinc-700/50";
  const sm = "rounded-md bg-zinc-200/80 animate-pulse motion-reduce:animate-none dark:bg-zinc-700/40";

  return (
    <div className={evaluatePageClass}>
      <div className={evaluateContainerClass}>
        <header className="w-full">
          <div className={`h-3 w-24 ${sm}`} />
          <div className={`mt-2 h-9 max-w-xs rounded-lg ${bar}`} />
          <div
            className={`mt-4 rounded-2xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50`}
          >
            <div className={`h-3 max-w-2xl rounded-md ${sm}`} />
            <div className={`mt-2 h-3 max-w-xl rounded-md ${sm}`} />
            <div className={`mt-2 h-3 max-w-md rounded-md ${sm}`} />
          </div>
        </header>
        <EvaluateFormSkeleton />
        <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className={`h-11 w-44 rounded-xl ${bar}`} />
        </div>
      </div>
    </div>
  );
}
