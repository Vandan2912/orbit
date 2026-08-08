"use client";

import { useEffect, useState } from "react";

function useClock(): string {
  const [time, setTime] = useState<string>("");
  useEffect(() => {
    const tick = () => setTime(new Date().toUTCString().slice(17, 25));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function ConsoleFrame({
  title,
  active,
  children,
}: {
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const clock = useClock();

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[var(--panel)] shadow-[0_0_40px_-15px_rgba(94,234,212,0.15)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-raised)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--rose)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--cyan)]/70" />
          </div>
          <span className="font-mono text-xs text-[var(--text-dim)]">{title}</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-[var(--text-faint)]">
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: active ? "var(--rose)" : "var(--text-faint)",
                animation: active ? "blink 1s step-end infinite" : "none",
              }}
            />
            {active ? "REC" : "IDLE"}
          </span>
          <span className="tabular-nums">{clock} UTC</span>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
