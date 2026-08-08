"use client";

import { useState } from "react";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { OrbitHero } from "@/components/OrbitHero";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveTelemetry } from "@/components/LiveTelemetry";
import { RecentTransmissions } from "@/components/RecentTransmissions";
import { ConsoleFrame } from "@/components/ConsoleFrame";
import { LogFeed } from "@/components/LogFeed";
import { FloatingObjects } from "@/components/FloatingObjects";
import { makeLogLine, type LogLine } from "@/lib/log-format";
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

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--panel)] ${className}`}>
      {children}
    </div>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const [zeropsApiToken, setZeropsApiToken] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployLog, setDeployLog] = useState<LogLine[]>([]);
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
        else setLog((prev) => [...prev, makeLogLine(event.step, event.message)]);
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
        else setDeployLog((prev) => [...prev, makeLogLine(event.step, event.message)]);
      });
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--void)] text-[var(--text)]">
      <nav className="fixed top-0 right-0 left-0 z-50 border-b border-[var(--border)] bg-[var(--void)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="font-mono text-sm tracking-widest text-[var(--text)]">ORBIT</span>
          <a
            href="https://github.com/Vandan2912/orbit"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--text-dim)] hover:text-[var(--text)]"
          >
            Source ↗
          </a>
        </div>
      </nav>

      <OrbitHero />

      <div id="telemetry" className="relative px-6 py-16">
        <LiveTelemetry />
      </div>

      <HowItWorks />
      <RecentTransmissions />

      <section id="console" className="relative overflow-hidden py-24">
        <FloatingObjects />

        <div className="relative mx-auto max-w-3xl px-6">
          <div className="mb-10 text-center">
            <div className="relative mx-auto mb-4 h-10 w-10 overflow-hidden rounded-full border border-[var(--border-bright)]">
              <div className="radar-sweep" />
            </div>
            <h2 className="text-sm font-medium tracking-[0.3em] text-[var(--text-faint)]">
              MISSION CONTROL
            </h2>
            <p className="mt-3 text-2xl font-semibold sm:text-3xl">Run it on a real repo</p>
          </div>

          <ConsoleFrame title="orbit://analysis" active={running}>
            <form onSubmit={analyze} className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-[var(--border-bright)] bg-[var(--panel-raised)] px-4 py-3 font-mono text-sm outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--cyan)]"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={running}
                className="rounded-lg bg-[var(--cyan)] px-6 py-3 font-medium text-[var(--void-deep)] transition hover:brightness-110 disabled:opacity-50"
              >
                {running ? "Analyzing…" : "Analyze"}
              </button>
            </form>

            <div className="mt-4">
              <LogFeed lines={log} running={running} />
            </div>

            {error && (
              <Panel className="mt-4 border-[var(--rose)]/40 bg-[var(--rose)]/10! p-4 text-sm text-[var(--rose)]">
                {error}
              </Panel>
            )}
          </ConsoleFrame>

          {result && (
            <div className="mt-8 space-y-8 rise-in">
              <Panel className="p-6">
                <h3 className="text-xs font-medium tracking-[0.2em] text-[var(--text-faint)]">
                  ARCHITECTURE
                </h3>
                <p className="mt-2 text-sm text-[var(--text-dim)]">{result.detectedStack.summary}</p>
                <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--void-deep)] p-4">
                  <MermaidDiagram chart={result.diagram} />
                </div>
              </Panel>

              <Panel className="p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium tracking-[0.2em] text-[var(--text-faint)]">
                    ZEROPS.YAML
                  </h3>
                  <button
                    onClick={() => navigator.clipboard.writeText(result.yaml)}
                    className="text-xs text-[var(--text-dim)] transition hover:text-[var(--cyan)]"
                  >
                    Copy
                  </button>
                </div>
                <pre className="mt-3 max-h-[500px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--void-deep)] p-4 font-mono text-sm text-[var(--text-dim)]">
                  {result.yaml}
                </pre>
              </Panel>

              <div>
                <div className="mb-4 text-center">
                  <h3 className="text-xs font-medium tracking-[0.2em] text-[var(--text-faint)]">
                    LAUNCH SEQUENCE
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--text-dim)]">
                    Forks the repo, commits this config to the fork, and deploys it into your
                    own Zerops account. Retries with a corrected config if it fails or the
                    app doesn&apos;t actually serve traffic — up to 3 attempts.
                  </p>
                </div>

                <ConsoleFrame title="orbit://launch" active={deploying}>
                  <form onSubmit={deploy} className="flex gap-2">
                    <input
                      type="password"
                      className="flex-1 rounded-lg border border-[var(--border-bright)] bg-[var(--panel-raised)] px-4 py-3 font-mono text-sm outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--violet)]"
                      placeholder="Zerops Personal Access Token"
                      value={zeropsApiToken}
                      onChange={(e) => setZeropsApiToken(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={deploying}
                      className="rounded-lg bg-[var(--violet)] px-6 py-3 font-medium text-[var(--void-deep)] transition hover:brightness-110 disabled:opacity-50"
                    >
                      {deploying ? "Launching…" : "Launch"}
                    </button>
                  </form>

                  <div className="mt-4">
                    <LogFeed lines={deployLog} running={deploying} />
                  </div>

                  {deployError && (
                    <Panel className="mt-4 border-[var(--rose)]/40 bg-[var(--rose)]/10! p-4 text-sm text-[var(--rose)]">
                      {deployError}
                    </Panel>
                  )}

                  {deployFailed && (
                    <Panel className="mt-4 border-[var(--amber)]/40 bg-[var(--amber)]/10! p-4 text-sm text-[var(--amber)]">
                      {deployFailed}
                    </Panel>
                  )}

                  {deployResult && (
                    <Panel className="mt-4 border-[var(--cyan)]/40 bg-[var(--cyan)]/10! p-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-[var(--cyan)]">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]"
                          style={{ animation: "twinkle 1.5s ease-in-out infinite" }}
                        />
                        IN ORBIT — live after {deployResult.attempts} attempt
                        {deployResult.attempts === 1 ? "" : "s"}
                      </div>
                      <a
                        href={deployResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all font-mono text-sm text-[var(--text)] underline decoration-[var(--cyan)]/50 underline-offset-4"
                      >
                        {deployResult.url}
                      </a>
                    </Panel>
                  )}
                </ConsoleFrame>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-[var(--border)] py-10 text-center text-xs text-[var(--text-faint)]">
        Built with Claude Code + Gemini, deployed on Zerops. Submitted to The Zerops
        Challenge (WeMakeDevs × Zerops).
      </footer>
    </div>
  );
}
