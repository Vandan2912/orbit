export function OrbitHero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden">
      <div className="starfield" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(94,234,212,0.08), transparent 70%), radial-gradient(ellipse 50% 40% at 70% 70%, rgba(167,139,250,0.08), transparent 70%)",
        }}
      />

      <div className="orbit-rings">
        <div
          className="orbit-ring"
          style={{ width: "260px", height: "260px", animation: "spin 14s linear infinite" }}
        />
        <div
          className="orbit-ring"
          style={{
            width: "420px",
            height: "420px",
            animation: "spin 24s linear infinite reverse",
            opacity: 0.7,
          }}
        />
        <div
          className="orbit-ring hidden sm:block"
          style={{ width: "600px", height: "600px", animation: "spin 40s linear infinite", opacity: 0.4 }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <div className="mb-6 flex items-center gap-2 rounded-full border border-[var(--border-bright)] bg-[var(--panel)]/80 px-4 py-1.5 text-xs tracking-wide text-[var(--text-dim)] backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cyan)]" style={{ animation: "twinkle 2s ease-in-out infinite" }} />
          Built for The Zerops Challenge
        </div>

        <h1 className="glow-text text-6xl font-bold tracking-tight text-[var(--text)] sm:text-8xl">
          ORBIT
        </h1>
        <p className="mt-6 max-w-xl text-balance text-lg text-[var(--text-dim)] sm:text-xl">
          Point it at any GitHub repo. Orbit infers the architecture, writes the{" "}
          <code className="rounded bg-[var(--panel-raised)] px-1.5 py-0.5 text-[var(--cyan)]">
            zerops.yaml
          </code>
          , and can launch it into a real deployment on Zerops — self-healing when the
          first attempt doesn&apos;t stick.
        </p>

        <a
          href="#console"
          className="group mt-10 inline-flex items-center gap-2 rounded-full bg-[var(--cyan)] px-7 py-3 font-medium text-[var(--void-deep)] transition hover:brightness-110"
          style={{ animation: "pulse-glow 2.5s ease-in-out infinite" }}
        >
          Launch Orbit
          <span className="transition-transform group-hover:translate-y-0.5">↓</span>
        </a>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[var(--text-faint)]">
          <span>ANALYZE ANY REPO</span>
          <span className="h-1 w-1 rounded-full bg-[var(--text-faint)]" />
          <span>GENERATE ZEROPS.YAML</span>
          <span className="h-1 w-1 rounded-full bg-[var(--text-faint)]" />
          <span>DEPLOY &amp; SELF-HEAL</span>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 text-[var(--text-faint)]">
        <div className="h-9 w-5 rounded-full border border-[var(--border-bright)]">
          <div
            className="mx-auto mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--cyan)]"
            style={{ animation: "rise 1.6s ease-in-out infinite alternate" }}
          />
        </div>
      </div>
    </section>
  );
}
