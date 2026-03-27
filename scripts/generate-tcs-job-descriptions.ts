/**
 * Writes Tata Consultancy Services–style job descriptions as JSONL:
 *   one object per line: { "title": string, "body": string }
 *
 * Usage (from repo root):
 *   npx tsx scripts/generate-tcs-job-descriptions.ts scripts/seed/tcs-jds-1500.jsonl
 *   npx tsx scripts/generate-tcs-job-descriptions.ts scripts/seed/tcs-jds-50.jsonl 50
 * Optional third argument is row count (default 1500). Stdout mode uses the same default.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_COUNT = 1500;
const SEED = 0x544353; // "TCS"

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const practices = [
  "Banking, Financial Services and Insurance (BFSI)",
  "Retail and CPG",
  "Manufacturing",
  "Life Sciences and Healthcare",
  "Energy, Resources and Utilities",
  "Communications, Media and Technology",
  "Public Services",
  "Travel, Transportation and Hospitality",
] as const;

const domains = [
  "core banking modernization",
  "payments and cards",
  "wealth and asset management",
  "insurance policy administration",
  "supply chain and logistics",
  "ERP transformation",
  "customer experience platforms",
  "digital workplace",
  "cybersecurity operations",
  "cloud migration and managed services",
  "data platforms and analytics",
  "IoT and edge solutions",
  "enterprise integration",
] as const;

const roles = [
  "Consultant",
  "Senior Consultant",
  "IT Analyst",
  "Senior IT Analyst",
  "Associate Consultant",
  "Lead",
  "Module Lead",
  "Technical Lead",
  "Solution Architect",
  "Associate Architect",
  "Delivery Manager",
  "Program Manager",
  "Engineer",
  "Senior Engineer",
  "Principal Engineer",
  "Developer",
  "Senior Developer",
  "Full Stack Developer",
  "Backend Developer",
  "Frontend Developer",
  "DevOps Engineer",
  "SRE",
  "QA Engineer",
  "Business Analyst",
  "Data Engineer",
  "ML Engineer",
  "SAP Consultant",
  "Salesforce Developer",
  "ServiceNow Developer",
  "Mainframe Developer",
  "Network Engineer",
  "Security Analyst",
  "Scrum Master",
  "Product Owner",
  "UX Designer",
] as const;

const techStacks = [
  "Java / Spring Boot / Microservices",
  ".NET / C# / Azure",
  "Python / FastAPI / AWS",
  "Node.js / TypeScript / React",
  "Angular / RxJS / REST APIs",
  "Kotlin / Spring / Kafka",
  "Go / gRPC / Kubernetes",
  "SAP S/4HANA / ABAP / Fiori",
  "Salesforce (Apex, LWC, Integration)",
  "ServiceNow (ITSM, CMDB, Flow Designer)",
  "Snowflake / dbt / ETL pipelines",
  "Databricks / Spark / PySpark",
  "Power BI / Azure Data Factory",
  "Terraform / Ansible / CI-CD",
  "Kubernetes / Helm / Istio",
  "Oracle PL/SQL / APEX",
  "Mainframe COBOL / JCL / DB2",
  "iOS / Android / React Native",
  "PEGA / BPM",
  "MuleSoft / API-led connectivity",
] as const;

const locations = [
  "Bangalore",
  "Chennai",
  "Hyderabad",
  "Pune",
  "Mumbai",
  "Kolkata",
  "Delhi NCR",
  "Ahmedabad",
  "North America (client site)",
  "UK / Europe (client site)",
  "Middle East (client site)",
  "APAC hybrid",
] as const;

const workModes = [
  "Hybrid with periodic travel to client locations",
  "Onsite at client premises",
  "Remote-first with overlap to client time zones",
  "Flexible hybrid — 2–3 days onsite as needed",
] as const;

function buildBody(
  rng: () => number,
  title: string,
  practice: string,
  domain: string,
  stack: string,
  location: string,
  mode: string,
): string {
  const years = 2 + Math.floor(rng() * 13);
  const team = 5 + Math.floor(rng() * 25);
  const bullets = [
    `Partner with global stakeholders to translate business outcomes into delivery roadmaps aligned to ${domain}.`,
    `Design and implement solutions using ${stack}, following secure SDLC, code review, and agile ceremonies.`,
    `Collaborate with cross-functional teams across TCS and client organizations (${team}+ member programs typical).`,
    `Drive quality through unit/integration testing, observability, and production support handover.`,
    `Contribute to estimation, risk management, and status reporting for senior leadership.`,
    `Apply TCS ways of working: continuous learning, knowledge sharing, and delivery excellence.`,
  ];
  const shuffled = shuffle(rng, bullets);

  return [
    `About the role`,
    ``,
    `${title} — ${practice}. You will support transformation and sustainment initiatives in ${domain}, working in a ${mode.toLowerCase()} model. Primary location / hub: ${location}.`,
    ``,
    `Key responsibilities`,
    ...shuffled.map((b) => `• ${b}`),
    ``,
    `Required experience`,
    `• ${years}+ years of relevant IT experience in technologies aligned to ${stack.split(" / ")[0]}.`,
    `• Strong problem-solving, communication, and stakeholder management skills.`,
    `• Bachelor's degree in Engineering, Computer Science, or related field (or equivalent experience).`,
    ``,
    `Preferred`,
    `• Certifications in cloud, agile, or platform-specific credentials where applicable.`,
    `• Exposure to regulated industries and global delivery models is a plus.`,
    ``,
    `Tata Consultancy Services is an equal opportunity employer and welcomes diverse candidates.`,
  ].join("\n");
}

function generateOne(
  rng: () => number,
  index: number,
): { title: string; body: string } {
  const role = pick(rng, roles);
  const practice = pick(rng, practices);
  const domain = pick(rng, domains);
  const stack = pick(rng, techStacks);
  const location = pick(rng, locations);
  const mode = pick(rng, workModes);
  const title = `${role} — ${practice.split("(")[0]!.trim()} (${stack.split(" / ")[0]})`;
  const body = buildBody(rng, title, practice, domain, stack, location, mode);
  return { title: `${title} [#${index + 1}]`, body };
}

function parseCountArg(argv: string | undefined): number {
  if (!argv) return DEFAULT_COUNT;
  const n = parseInt(argv, 10);
  if (!Number.isFinite(n) || n < 1 || n > 50_000) {
    console.error("Count must be between 1 and 50000");
    process.exit(1);
  }
  return n;
}

async function main() {
  const a2 = process.argv[2];
  const a3 = process.argv[3];
  const rng = mulberry32(SEED);

  const writeLine = (s: string) => {
    process.stdout.write(s + "\n");
  };

  /** `tsx script 50` → stdout; `tsx script out.jsonl 50` → file */
  const isStdoutCountOnly = a2 !== undefined && /^\d+$/.test(a2);
  if (!a2 || isStdoutCountOnly) {
    const count = isStdoutCountOnly ? parseCountArg(a2) : DEFAULT_COUNT;
    for (let i = 0; i < count; i++) {
      writeLine(JSON.stringify(generateOne(rng, i)));
    }
    return;
  }

  const count = parseCountArg(a3);
  const dir = path.dirname(a2);
  await mkdir(dir, { recursive: true });
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    lines.push(JSON.stringify(generateOne(rng, i)));
  }
  await writeFile(a2, `${lines.join("\n")}\n`, "utf8");
  console.error(`Wrote ${count} rows to ${path.resolve(a2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
