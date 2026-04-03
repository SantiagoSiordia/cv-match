import { MAX_EMBEDDING_CHARS } from "@/lib/constants";
import type { CvMatchRow } from "@/lib/embeddings";
import type { CvStoredMeta, JobStoredMeta } from "@/lib/schemas";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Job titles / names that imply hands-on or solution technical work. */
const TECH_JOB_PHRASES: string[] = [
  "solution architect",
  "solutions architect",
  "software architect",
  "technical architect",
  "cloud architect",
  "enterprise architect",
  "application architect",
  "data architect",
  "security architect",
  "software engineer",
  "software developer",
  "web developer",
  "full stack",
  "fullstack",
  "frontend",
  "front end",
  "backend",
  "back end",
  "mobile developer",
  "ios developer",
  "android developer",
  "devops",
  "site reliability",
  "sre engineer",
  "platform engineer",
  "infrastructure engineer",
  "cloud engineer",
  "network engineer",
  "security engineer",
  "systems engineer",
  "data engineer",
  "data scientist",
  "machine learning engineer",
  "ml engineer",
  "ai engineer",
  "embedded engineer",
  "firmware",
  "qa engineer",
  "test automation",
  "automation engineer",
  "blockchain",
  "solidity",
];

/** Match if `haystack` contains phrase (word-boundary style via spaces from norm). */
function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${haystack} `;
  const p = ` ${phrase} `;
  return h.includes(p);
}

/** JD is treated as “technical hiring” when title/name/skills look like an IC/technical role. */
export function jobRequiresTechnicalCandidates(
  job: JobStoredMeta,
  displayTitle: string,
): boolean {
  const blob = norm(
    `${displayTitle} ${job.originalName.replace(/\.[^.]+$/, "")} ${(job.geminiSkills ?? []).join(" ")}`,
  );
  for (const phrase of TECH_JOB_PHRASES) {
    if (containsPhrase(blob, phrase)) return true;
  }
  if (/\bengineer\b/.test(blob) && !containsPhrase(blob, "sales engineer")) {
    return true;
  }
  if (/\bdeveloper\b/.test(blob) || /\bprogrammer\b/.test(blob)) {
    return true;
  }
  return false;
}

const TECH_SKILL_SUBSTRINGS: string[] = [
  "amazon web services",
  "google cloud",
  "machine learning",
  "artificial intelligence",
  "node.js",
  "node js",
  "react.js",
  "vue.js",
  "angular.js",
  "asp.net",
  "ci cd",
  "cicd",
  "typescript",
  "javascript",
  "kubernetes",
  "terraform",
  "ansible",
  "postgresql",
  "mongodb",
  "elasticsearch",
  "snowflake",
  "bigquery",
  "graphql",
  "microservices",
  "pytorch",
  "tensorflow",
  "fastapi",
  "spring boot",
  "spring framework",
  "django",
  "flask",
  "ruby on rails",
  ".net core",
  "powershell",
  "bash scripting",
  "shell scripting",
  "blockchain",
  "solidity",
  "python",
  "java",
  "golang",
  "kotlin",
  "scala",
  "rust",
  "swift",
  "php",
  "ruby",
  "perl",
  "matlab",
  "sql",
  "nosql",
  "redis",
  "kafka",
  "rabbitmq",
  "spark",
  "airflow",
  "dbt",
  "etl",
  "pandas",
  "numpy",
  "linux",
  "docker",
  "jenkins",
  "gitlab",
  "github",
  "azure",
  "aws",
  "gcp",
  "lambda",
  "ec2",
  "s3",
  "rds",
  "vpc",
  "iam",
  "c++",
  "c#",
  "cpp",
  "go lang",
  "react",
  "angular",
  "vue",
  "nodejs",
  "rest api",
  "grpc",
  "oauth",
  "oauth2",
  "openapi",
  "swagger",
];

const TECH_POSITION_RE =
  /\b(software|solutions|solution|technical|cloud|enterprise|data|security|application|infrastructure|platform)\s+architect\b|\b(software|web|mobile|full[\s-]?stack|front[\s-]?end|back[\s-]?end|data|ml|machine learning|devops|site reliability|network|security|systems|platform|infrastructure|cloud|qa|test automation|automation|embedded|firmware)\s+engineer\b|\bdeveloper\b|\bprogrammer\b|\bdevops\b|\bsre\b|\bdata scientist\b|\bml engineer\b|\bai engineer\b/i;

const NON_TECH_POSITION_PHRASES: string[] = [
  "scrum master",
  "agile coach",
  "product owner",
  "project manager",
  "program manager",
  "delivery manager",
  "business analyst",
  "people partner",
  "hr business partner",
  "recruiter",
  "account executive",
  "sales manager",
  "customer success",
];

function technicalSkillHit(skillNorm: string): boolean {
  const s = ` ${skillNorm} `;
  for (const sub of TECH_SKILL_SUBSTRINGS) {
    if (s.includes(sub)) return true;
  }
  return false;
}

/** True when CV metadata shows engineering / technical skills (or a technical title). */
export function cvHasTechnicalEvidence(cv: CvStoredMeta | undefined): boolean {
  if (!cv) return false;
  const pos = norm(cv.gemini?.currentPosition ?? "");
  if (pos && TECH_POSITION_RE.test(pos)) return true;
  const skills = cv.gemini?.hardSkills ?? [];
  for (const raw of skills) {
    const sn = norm(raw);
    if (sn.length && technicalSkillHit(sn)) return true;
  }
  return false;
}

/**
 * Whole-word / phrase signals in extracted résumé text (same head window as embeddings).
 * Fills gaps when Gemini left `hardSkills` / title empty so we still detect engineers.
 */
const TECH_RESUME_SINGLE_TOKENS = new Set<string>([
  "angular",
  "ansible",
  "apache",
  "aws",
  "azure",
  "airflow",
  "bash",
  "bigquery",
  "blockchain",
  "cassandra",
  "cloudformation",
  "cpp",
  "css",
  "django",
  "docker",
  "dynamodb",
  "elasticsearch",
  "ethereum",
  "fastapi",
  "flask",
  "gcp",
  "git",
  "github",
  "gitlab",
  "golang",
  "graphql",
  "grpc",
  "hadoop",
  "html",
  "iam",
  "java",
  "javascript",
  "jenkins",
  "kafka",
  "keras",
  "kotlin",
  "kubernetes",
  "lambda",
  "linux",
  "mongodb",
  "mysql",
  "nginx",
  "nodejs",
  "nosql",
  "numpy",
  "oauth",
  "pandas",
  "perl",
  "php",
  "postgresql",
  "postgres",
  "powershell",
  "pyspark",
  "python",
  "pytorch",
  "rabbitmq",
  "react",
  "redis",
  "ruby",
  "rust",
  "scala",
  "snowflake",
  "solidity",
  "spark",
  "sql",
  "sqlite",
  "swift",
  "swiftui",
  "tailwind",
  "tensorflow",
  "terraform",
  "typescript",
  "unix",
  "vba",
  "vue",
  "webpack",
]);

const MULTI_WORD_TECH_IN_RESUME: string[] = [
  ...new Set(
    TECH_SKILL_SUBSTRINGS.filter((s) => s.includes(" ") || s.length >= 6),
  ),
].sort((a, b) => b.length - a.length);

const RESUME_CODE_MARKERS =
  /c\+\+|c#|\.net\s+core|\b\.net\b|node\.js|objective[\s-]?c|ci\/cd/i;

export function extractedResumeTextLooksTechnical(text: string): boolean {
  const slice = text.slice(0, MAX_EMBEDDING_CHARS);
  if (!slice.trim()) return false;
  if (RESUME_CODE_MARKERS.test(slice)) return true;
  const n = norm(slice);
  for (const phrase of MULTI_WORD_TECH_IN_RESUME) {
    if (containsPhrase(n, phrase)) return true;
  }
  for (const token of n.split(/\s+/)) {
    if (token.length < 2) continue;
    if (TECH_RESUME_SINGLE_TOKENS.has(token)) return true;
  }
  return false;
}

export function cvHasTechnicalEvidenceWithText(
  cv: CvStoredMeta | undefined,
  cvText: string | undefined,
): boolean {
  if (cvHasTechnicalEvidence(cv)) return true;
  if (cv && fileNameSuggestsTechnicalRole(cv)) return true;
  if (cvText && extractedResumeTextLooksTechnical(cvText)) return true;
  return false;
}

/**
 * Filename hints for agile/PM-style CVs. Used even when Gemini filled a generic
 * `currentPosition` (e.g. “Consultant”) — otherwise “Scrum master 1.pdf” stayed in the
 * technical tier and won on embedding alone.
 */
function fileNameSuggestsNonTechnicalRole(cv: CvStoredMeta): boolean {
  const n = norm(cv.originalName.replace(/\.[^.]+$/, ""));
  if (!n.length) return false;
  if ((n.includes("scrum") && n.includes("master")) || n.includes("scrummaster")) {
    return true;
  }
  if (containsPhrase(n, "product owner") || n.includes("productowner")) return true;
  if (containsPhrase(n, "agile coach")) return true;
  if (containsPhrase(n, "business analyst")) return true;
  if (containsPhrase(n, "project manager")) return true;
  return false;
}

/** When body text / metadata is thin (scanned PDFs), the file name may still say “engineer”. */
const TECH_FILENAME_PHRASES: string[] = [
  "solutions architect",
  "software architect",
  "cloud architect",
  "data engineer",
  "software engineer",
  "machine learning",
  "full stack",
  "fullstack",
  "javascript",
  "typescript",
  "kubernetes",
  "terraform",
  "developer",
  "programmer",
  "devops",
  "engineer",
  "architect",
  "scientist",
  "python",
  "golang",
  "backend",
  "frontend",
].sort((a, b) => b.length - a.length);

function fileNameSuggestsTechnicalRole(cv: CvStoredMeta): boolean {
  const n = norm(cv.originalName.replace(/\.[^.]+$/, ""));
  if (!n.length) return false;
  for (const phrase of TECH_FILENAME_PHRASES) {
    if (containsPhrase(n, phrase)) return true;
  }
  return false;
}

function cvRoleLooksNonTechnical(cv: CvStoredMeta | undefined): boolean {
  if (!cv) return false;
  const pos = norm(cv.gemini?.currentPosition ?? "");
  for (const phrase of NON_TECH_POSITION_PHRASES) {
    if (containsPhrase(pos, phrase)) return true;
  }
  if (fileNameSuggestsNonTechnicalRole(cv)) return true;
  return false;
}

/**
 * True only when we are confident the profile is non-technical (Scrum/PM/BA, etc.)
 * and neither metadata nor résumé text (embedding-length prefix) shows technical signals.
 */
export function cvIsClearlyNonTechnical(
  cv: CvStoredMeta | undefined,
  cvText?: string,
): boolean {
  if (cvHasTechnicalEvidenceWithText(cv, cvText)) return false;
  return cvRoleLooksNonTechnical(cv);
}

/**
 * For technical jobs, when at least one scored CV is technical, move clearly non-technical
 * CVs (e.g. Scrum Master with no tech skills) after all technical ones. Embedding order
 * is preserved within each tier.
 */
export function applyTechnicalJobMatchOrdering(
  job: JobStoredMeta,
  jobDisplayTitle: string,
  matches: CvMatchRow[],
  cvById: Map<string, CvStoredMeta>,
  compareRows: (a: CvMatchRow, b: CvMatchRow) => number,
  /** Extracted résumé text per CV (enables tech detection when Gemini skills are empty). */
  cvTextById?: ReadonlyMap<string, string>,
): CvMatchRow[] {
  if (!jobRequiresTechnicalCandidates(job, jobDisplayTitle)) {
    return matches;
  }

  const nonSkipped = matches.filter((m) => !m.skipped);
  if (nonSkipped.length === 0) return matches;

  const textFor = (cvId: string) => cvTextById?.get(cvId);

  const anyTechnical = nonSkipped.some((m) =>
    cvHasTechnicalEvidenceWithText(cvById.get(m.cvId), textFor(m.cvId)),
  );
  if (!anyTechnical) return matches;

  const skipped = matches.filter((m) => m.skipped);
  const technical = nonSkipped.filter(
    (m) => !cvIsClearlyNonTechnical(cvById.get(m.cvId), textFor(m.cvId)),
  );
  const nonTechnical = nonSkipped.filter((m) =>
    cvIsClearlyNonTechnical(cvById.get(m.cvId), textFor(m.cvId)),
  );

  technical.sort(compareRows);
  nonTechnical.sort(compareRows);
  return [...technical, ...nonTechnical, ...skipped];
}
