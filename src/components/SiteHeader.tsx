import Link from "next/link";

const links = [
  { href: "/cvs", label: "CVs" },
  { href: "/job-descriptions", label: "Jobs" },
  { href: "/evaluate", label: "Evaluate" },
  { href: "/analytics", label: "Analytics" },
  { href: "/dashboard", label: "Results" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/evaluate"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          CV Match
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-1 py-0.5 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
