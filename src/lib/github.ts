const MANIFEST_FILES = [
  "package.json",
  "pnpm-workspace.yaml",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
  "composer.json",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Dockerfile",
  "docker-compose.yml",
  "next.config.ts",
  "next.config.js",
  "nuxt.config.ts",
  "vite.config.ts",
  ".env.example",
];

export type RepoRef = { owner: string; repo: string; ref?: string };

export function parseRepoUrl(url: string): RepoRef {
  const match = url
    .trim()
    .replace(/\.git$/, "")
    .match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\/tree\/([^/]+))?\/?$/);
  if (!match) {
    throw new Error(`Not a recognizable GitHub repo URL: ${url}`);
  }
  const [, owner, repo, ref] = match;
  return { owner, repo, ref };
}

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function ghFetch(path: string): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, { headers: githubHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function fetchDefaultBranch(ref: RepoRef): Promise<string> {
  if (ref.ref) return ref.ref;
  const res = await ghFetch(`/repos/${ref.owner}/${ref.repo}`);
  const data = await res.json();
  return data.default_branch as string;
}

export async function fetchFileTree(ref: RepoRef, branch: string): Promise<string[]> {
  const res = await ghFetch(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${branch}?recursive=1`,
  );
  const data = await res.json();
  return (data.tree as { path: string; type: string }[])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
}

export async function fetchFileContents(
  ref: RepoRef,
  branch: string,
  paths: string[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      try {
        const res = await fetch(
          `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${path}`,
        );
        if (res.ok) {
          const text = await res.text();
          results[path] = text.slice(0, 8000);
        }
      } catch {
        // best-effort: skip files that fail to fetch
      }
    }),
  );
  return results;
}

export function pickManifestPaths(tree: string[]): string[] {
  const topLevelAndShallow = tree.filter((p) => p.split("/").length <= 3);
  return topLevelAndShallow.filter((p) =>
    MANIFEST_FILES.some((name) => p === name || p.endsWith(`/${name}`)),
  );
}
