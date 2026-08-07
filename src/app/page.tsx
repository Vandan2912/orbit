"use client";

import { useState } from "react";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import type { DetectedStack, ProgressEvent } from "@/lib/types";

type Result = { detectedStack: DetectedStack; yaml: string; diagram: string };

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    setLog([]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
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
          const event = JSON.parse(line.slice("data: ".length)) as ProgressEvent;

          if (event.step === "done") {
            setResult(event.result);
          } else if (event.step === "error") {
            setError(event.message);
          } else {
            setLog((prev) => [...prev, event.message]);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
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
          </div>
        )}
      </main>
    </div>
  );
}
