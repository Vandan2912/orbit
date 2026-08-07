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

  const existing = await ghFetch(`/repos/${login}/${repo}`);
  if (!existing.ok) {
    const forkRes = await ghFetch(`/repos/${owner}/${repo}/forks`, { method: "POST" });
    if (!forkRes.ok) {
      throw new Error(`Failed to fork ${owner}/${repo}: ${forkRes.status} ${forkRes.statusText}`);
    }
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      const check = await ghFetch(`/repos/${login}/${repo}`);
      if (check.ok) break;
      if (i === 14) throw new Error("Fork did not become ready in time");
    }
  }

  const repoInfo = await (await ghFetch(`/repos/${login}/${repo}`)).json();
  return { login, repo, defaultBranch: repoInfo.default_branch as string };
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
