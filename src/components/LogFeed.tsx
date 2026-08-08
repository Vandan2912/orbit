import type { LogLine } from "@/lib/log-format";

export function LogFeed({ lines, running }: { lines: LogLine[]; running: boolean }) {
  if (lines.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--void-deep)] p-4 font-mono text-sm text-[var(--text-faint)]">
        Standing by for input…
      </div>
    );
  }
  return (
    <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--void-deep)] p-4 font-mono text-sm">
      {lines.map((line, i) => (
        <div key={i} className="flex gap-3">
          <span className="shrink-0 text-[var(--text-faint)]">{line.time}</span>
          <span className="w-20 shrink-0 font-medium" style={{ color: line.color }}>
            {line.tag}
          </span>
          <span className="text-[var(--text-dim)]">{line.message}</span>
        </div>
      ))}
      {running && (
        <div className="flex gap-3">
          <span className="shrink-0 text-[var(--text-faint)]">&nbsp;</span>
          <span className="terminal-cursor text-[var(--text-dim)]" />
        </div>
      )}
    </div>
  );
}
