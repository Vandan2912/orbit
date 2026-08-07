function headers() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, { ...init, headers: headers() });
  return res;
}

export async function getAuthenticatedGithubLogin(): Promise<string> {
  const res = await ghFetch("/user");
  if (!res.ok) throw new Error("GITHUB_TOKEN is not configured or invalid — can't fork repos to deploy");
  const data = await res.json();
  return data.login as string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function forkRepo(owner: string, repo: string): Promise<{ login: string; repo: string; defaultBranch: string }> {
  const login = await getAuthenticatedGithubLogin();

  // Resolve the canonical owner/name first — the GitHub API follows redirects for
  // renamed repos, and forking must target the current name, not whatever the user typed.
  const canonicalRes = await ghFetch(`/repos/${owner}/${repo}`);
  if (!canonicalRes.ok) {
    throw new Error(`Repository ${owner}/${repo} not found: ${canonicalRes.status}`);
  }
  const canonical = await canonicalRes.json();
  const canonicalOwner = canonical.owner.login as string;
  const canonicalRepo = canonical.name as string;

  const existing = await ghFetch(`/repos/${login}/${canonicalRepo}`);
  if (!existing.ok) {
    const forkRes = await ghFetch(`/repos/${canonicalOwner}/${canonicalRepo}/forks`, { method: "POST" });
    if (!forkRes.ok) {
      throw new Error(`Failed to fork ${canonicalOwner}/${canonicalRepo}: ${forkRes.status} ${forkRes.statusText}`);
    }
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const check = await ghFetch(`/repos/${login}/${canonicalRepo}`);
      if (check.ok) break;
      if (i === 19) throw new Error("Fork did not become ready in time");
    }
  }

  const repoInfo = await (await ghFetch(`/repos/${login}/${canonicalRepo}`)).json();
  return { login, repo: canonicalRepo, defaultBranch: repoInfo.default_branch as string };
}

export async function commitZeropsYaml(params: {
  login: string;
  repo: string;
  branch: string;
  content: string;
  message: string;
}): Promise<void> {
  const existing = await ghFetch(
    `/repos/${params.login}/${params.repo}/contents/zerops.yaml?ref=${params.branch}`,
  );
  const sha = existing.ok ? (await existing.json()).sha : undefined;

  const res = await ghFetch(`/repos/${params.login}/${params.repo}/contents/zerops.yaml`, {
    method: "PUT",
    body: JSON.stringify({
      message: params.message,
      content: Buffer.from(params.content, "utf-8").toString("base64"),
      branch: params.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to commit zerops.yaml to fork: ${res.status} ${body}`);
  }
}
