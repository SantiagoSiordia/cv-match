**CV Match** — match résumés to job descriptions with [Google Gemini](https://ai.google.dev/). See [PRD.md](./PRD.md) for product scope.

This is a [Next.js](https://nextjs.org) app (TypeScript, App Router, Tailwind).

## Getting Started

Copy [`.env.example`](./.env.example) to `.env` and set `GEMINI_API_KEY`.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Local data (not in git)

Uploads and runs live under `cvs-pdf/`, `cvs-extracted/`, `cvs-meta/`, `job-descriptions/`, and `evaluations/`. Those paths are **gitignored**; only `.gitkeep` placeholders are tracked. Use the UI or `npm run ingest:*` / `npm run migrate:cvs-layout` locally as needed.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
