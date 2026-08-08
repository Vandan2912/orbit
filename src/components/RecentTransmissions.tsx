"use client";

import { useEffect, useState } from "react";
import type { DetectedStack } from "@/lib/types";

type HistoryEntry = {
  id: string;
  repo_url: string;
  detected_stack: DetectedStack;
  created_at: string;
};

function shortRepo(url: string): string {
  return url.replace(/^https?:\/\/github\.com\//, "");
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
              <a
                key={entry.id}
                href={entry.repo_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-4 transition hover:border-[var(--border-bright)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cyan)]"
                    style={{ animation: "twinkle 2.4s ease-in-out infinite" }}
                  />
                  <span className="truncate font-mono text-sm text-[var(--text)]">
                    {shortRepo(entry.repo_url)}
                  </span>
                  {primary && (
                    <span className="hidden shrink-0 rounded-full border border-[var(--border-bright)] px-2 py-0.5 text-[10px] text-[var(--text-dim)] sm:inline">
                      {primary.language}
                      {primary.framework ? ` · ${primary.framework}` : ""}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-[var(--text-faint)]">
                  {timeAgo(entry.created_at)}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
