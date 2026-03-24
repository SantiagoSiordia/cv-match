import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        CV Match
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Match résumés to roles with structured scoring powered by Google Gemini.
        Files stay on disk in this project — upload CVs and job descriptions,
        then run an evaluation.
      </p>

      <div className="mt-10">
        <Link
          href="/evaluate"
          className="inline-flex rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Evaluate candidates
        </Link>
        <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Before you evaluate, add{" "}
          <Link
            href="/cvs"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            CVs (PDF)
          </Link>{" "}
          and{" "}
          <Link
            href="/job-descriptions"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            job descriptions
          </Link>
          . Review saved runs anytime on the{" "}
          <Link
            href="/dashboard"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
          >
            dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
