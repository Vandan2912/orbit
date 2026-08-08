"use client";

import { useEffect, useState } from "react";
import type { DetectedStack } from "@/lib/types";

type HistoryEntry = {
  id: string;
  repo_url: string;
  detected_stack: DetectedStack;
  created_at: string;
  live_url: string | null;
  deployed_at: string | null;
};

function shortRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "");
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function RecentTransmissions() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setEntries(d.analyses ?? []))
      .catch(() => setEntries([]));
  }, []);

  if (!entries || entries.length === 0) return null;

  return (
    <section className="relative border-t border-[var(--border)] bg-[var(--void-deep)] py-24">
      <div className="mx-auto max-w-3xl px-6">
        <h2 className="text-center text-sm font-medium tracking-[0.3em] text-[var(--text-faint)]">
          RECENT TRANSMISSIONS
        </h2>
        <p className="mt-3 text-center text-2xl font-semibold sm:text-3xl">
          Real repos, actually analyzed
        </p>

        <div className="mt-10 space-y-3">
          {entries.slice(0, 5).map((entry) => {
            const primary = entry.detected_stack.services?.[0];
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--border-bright)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cyan)]"
                    style={{ animation: "twinkle 2.4s ease-in-out infinite" }}
                  />
                  <a
                    href={entry.repo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex min-w-0 items-center gap-1.5 text-[var(--text)] transition hover:text-[var(--cyan)]"
                  >
                    <GithubIcon />
                    <span className="truncate font-mono text-sm underline decoration-[var(--border-bright)] decoration-1 underline-offset-4 group-hover:decoration-[var(--cyan)]">
                      {shortRepo(entry.repo_url)}
                    </span>
                  </a>
                  {primary && (
                    <span className="hidden shrink-0 rounded-full border border-[var(--border-bright)] px-2 py-0.5 text-[10px] text-[var(--text-dim)] sm:inline">
                      {primary.language}
                      {primary.framework ? ` · ${primary.framework}` : ""}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {entry.live_url && (
                    <a
                      href={entry.live_url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-[var(--cyan)]/40 bg-[var(--cyan)]/10! px-2.5 py-1 text-[10px] font-medium text-[var(--cyan)] transition hover:border-[var(--cyan)]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" />
                      LIVE
                      <span className="hidden font-mono font-normal opacity-80 sm:inline">
                        {shortUrl(entry.live_url)}
                      </span>
                    </a>
                  )}
                  <span className="text-xs text-[var(--text-faint)]">{timeAgo(entry.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
