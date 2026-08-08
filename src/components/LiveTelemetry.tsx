"use client";

import { useEffect, useState } from "react";

type Stats = { totalAnalyses: number; uniqueRepos: number; lastAnalyzedAt: string | null };

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function LiveTelemetry() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const items = [
    { label: "TRANSMISSIONS RECEIVED", value: stats ? stats.totalAnalyses.toLocaleString() : "—" },
    { label: "REPOS SCANNED", value: stats ? stats.uniqueRepos.toLocaleString() : "—" },
    { label: "LAST SIGNAL", value: stats ? timeAgo(stats.lastAnalyzedAt) : "—" },
  ];

  return (
    <div className="relative z-10 mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-xl border border-[var(--border)] bg-[var(--panel)]/60 px-8 py-5 backdrop-blur">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-10">
          {i > 0 && <div className="hidden h-8 w-px bg-[var(--border)] sm:block" />}
          <div className="text-center" style={{ animation: "count-up 0.5s ease-out both" }}>
            <div className="font-mono text-xl text-[var(--cyan)]">{item.value}</div>
            <div className="mt-1 text-[10px] tracking-[0.15em] text-[var(--text-faint)]">{item.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
