/** Shared layout tokens so loading skeleton and loaded UI match width and rhythm. */
export const evaluatePageClass =
  "min-h-[calc(100dvh-5rem)] bg-gradient-to-b from-zinc-100/90 via-white to-zinc-50/80 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950/95";

export const evaluateContainerClass = "mx-auto w-full max-w-5xl px-4 py-10 sm:px-6";

export const evaluateGridClass =
  "mt-8 grid w-full grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8 lg:items-stretch";

/** Cards share width, min height, and padding across skeleton + loaded states. */
export const evaluateCardClass =
  "flex w-full min-w-0 min-h-[20rem] flex-col rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 dark:shadow-none sm:p-6";

export const evaluateSectionLabelClass =
  "text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400";
