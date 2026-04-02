/** GitHub tree API for arefinnomi/curriculum_vitae_data (public CV PDF dataset). */

export const CV_DATASET_OWNER = "arefinnomi";
export const CV_DATASET_REPO = "curriculum_vitae_data";
export const CV_DATASET_BRANCH = "master";

export type GithubTreeEntry = { path: string; type: string; size?: number };

export async function fetchCurriculumVitaeDatasetTree(): Promise<
  GithubTreeEntry[]
> {
  const url = `https://api.github.com/repos/${CV_DATASET_OWNER}/${CV_DATASET_REPO}/git/trees/${CV_DATASET_BRANCH}?recursive=1`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cv-match",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub tree API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { tree: GithubTreeEntry[] };
  return data.tree;
}

/** Sorted paths under `pdf/` ending in `.pdf`. */
export function listPdfPathsInDatasetTree(tree: GithubTreeEntry[]): string[] {
  return tree
    .filter(
      (e) =>
        e.type === "blob" &&
        e.path.startsWith("pdf/") &&
        e.path.toLowerCase().endsWith(".pdf"),
    )
    .map((e) => e.path)
    .sort();
}

export function curriculumVitaeDatasetRawUrl(filePath: string): string {
  return `https://raw.githubusercontent.com/${CV_DATASET_OWNER}/${CV_DATASET_REPO}/${CV_DATASET_BRANCH}/${filePath}`;
}
