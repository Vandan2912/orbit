"use client";

import { useState } from "react";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import type { DetectedStack, ProgressEvent, DeployProgressEvent } from "@/lib/types";

type Result = { detectedStack: DetectedStack; yaml: string; diagram: string };
type DeployResult = { url: string; projectId: string; attempts: number };

async function streamSSE<E extends { step: string }>(
  url: string,
  body: object,
  onEvent: (event: E) => void,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("No response stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      onEvent(JSON.parse(line.slice("data: ".length)) as E);
    }
  }
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const [zeropsApiToken, setZeropsApiToken] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [deployFailed, setDeployFailed] = useState<string | null>(null);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    setLog([]);
    setDeployResult(null);
    setDeployFailed(null);
    setDeployError(null);
    setDeployLog([]);

    try {
      await streamSSE<ProgressEvent>("/api/analyze", { repoUrl }, (event) => {
        if (event.step === "done") setResult(event.result);
        else if (event.step === "error") setError(event.message);
        else setLog((prev) => [...prev, event.message]);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  async function deploy(e: React.FormEvent) {
    e.preventDefault();
    setDeploying(true);
    setDeployError(null);
    setDeployFailed(null);
    setDeployResult(null);
    setDeployLog([]);

    try {
      await streamSSE<DeployProgressEvent>("/api/deploy", { repoUrl, zeropsApiToken }, (event) => {
        if (event.step === "done") setDeployResult(event);
        else if (event.step === "error") setDeployError(event.message);
        else if (event.step === "failed") setDeployFailed(event.message);
        else setDeployLog((prev) => [...prev, event.message]);
      });
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Orbit</h1>
        <p className="mt-2 text-neutral-400">
          Point it at a public GitHub repo — it infers the service architecture and
          generates a working <code>zerops.yaml</code> for deploying it on Zerops.
        </p>

        <form onSubmit={analyze} className="mt-8 flex gap-2">
          <input
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 outline-none focus:border-neutral-600"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={running}
            className="rounded-md bg-neutral-100 px-5 py-2 font-medium text-neutral-900 disabled:opacity-50"
          >
            {running ? "Analyzing…" : "Analyze"}
          </button>
        </form>

        {log.length > 0 && (
          <div className="mt-6 space-y-1 rounded-md border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm text-neutral-400">
            {log.map((line, i) => (
              <div key={i}>→ {line}</div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-md border border-red-900 bg-red-950 p-4 text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8 space-y-8">
            <section>
              <h2 className="text-lg font-medium">Architecture</h2>
              <p className="mt-1 text-neutral-400">{result.detectedStack.summary}</p>
              <div className="mt-3 rounded-md border border-neutral-800 bg-white p-4">
                <MermaidDiagram chart={result.diagram} />
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">zerops.yaml</h2>
                <button
                  onClick={() => navigator.clipboard.writeText(result.yaml)}
                  className="text-sm text-neutral-400 hover:text-neutral-100"
                >
                  Copy
                </button>
              </div>
              <pre className="mt-2 max-h-[500px] overflow-auto rounded-md border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-200">
                {result.yaml}
              </pre>
            </section>

            <section className="border-t border-neutral-800 pt-8">
              <h2 className="text-lg font-medium">Deploy it for real</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Orbit forks the repo, commits this <code>zerops.yaml</code> to the fork, and
                deploys the fork into your own Zerops account via a Personal Access Token
                (Zerops dashboard → Settings → Access Token Management). If the build fails,
                Orbit regenerates the config and retries, up to 3 attempts — note Zerops&apos;s
                public API only exposes pass/fail status, not raw build logs, so retries
                reason from common failure patterns rather than exact error text.
              </p>

              <form onSubmit={deploy} className="mt-4 flex gap-2">
                <input
                  type="password"
                  className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 outline-none focus:border-neutral-600"
                  placeholder="Zerops Personal Access Token"
                  value={zeropsApiToken}
                  onChange={(e) => setZeropsApiToken(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={deploying}
                  className="rounded-md bg-neutral-100 px-5 py-2 font-medium text-neutral-900 disabled:opacity-50"
                >
                  {deploying ? "Deploying…" : "Deploy to Zerops"}
                </button>
              </form>

              {deployLog.length > 0 && (
                <div className="mt-4 space-y-1 rounded-md border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm text-neutral-400">
                  {deployLog.map((line, i) => (
                    <div key={i}>→ {line}</div>
                  ))}
                </div>
              )}

              {deployError && (
                <div className="mt-4 rounded-md border border-red-900 bg-red-950 p-4 text-red-300">
                  {deployError}
                </div>
              )}

              {deployFailed && (
                <div className="mt-4 rounded-md border border-amber-900 bg-amber-950 p-4 text-amber-300">
                  {deployFailed}
                </div>
              )}

              {deployResult && (
                <div className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 p-4 text-emerald-300">
                  Live after {deployResult.attempts} attempt{deployResult.attempts === 1 ? "" : "s"}:{" "}
                  <a href={deployResult.url} target="_blank" rel="noreferrer" className="underline">
                    {deployResult.url}
                  </a>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
