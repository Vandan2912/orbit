const STEPS = [
  {
    label: "01",
    title: "Point at a repo",
    body: "Paste any public GitHub URL. No zerops.yaml required — Orbit works on repos that have never heard of Zerops.",
  },
  {
    label: "02",
    title: "Orbit reads it",
    body: "Fetches the file tree and manifests (package.json, go.mod, requirements.txt…) straight from GitHub.",
  },
  {
    label: "03",
    title: "Gemini infers the shape",
    body: "Languages, frameworks, build & start commands, ports, managed services — reasoned from what's actually in the repo.",
  },
  {
    label: "04",
    title: "Launch & self-heal",
    body: "Forks the repo, commits the generated config, deploys to your Zerops account, and retries with a corrected config if the first attempt doesn't serve traffic.",
  },
];

export function HowItWorks() {
  return (
    <section className="relative border-y border-[var(--border)] bg-[var(--void-deep)] py-24">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="text-center text-sm font-medium tracking-[0.3em] text-[var(--text-faint)]">
          FLIGHT PATH
        </h2>
        <p className="mt-3 text-center text-2xl font-semibold text-[var(--text)] sm:text-3xl">
          From a bare repo to a live URL
        </p>

        <div className="relative mt-16 grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-6">
          <div
            className="absolute top-6 right-0 left-0 hidden h-px md:block"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, var(--border-bright) 0 8px, transparent 8px 16px)",
            }}
          />
          {STEPS.map((step) => (
            <div key={step.label} className="relative flex flex-col items-start">
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-bright)] bg-[var(--panel)] font-mono text-sm text-[var(--cyan)]">
                {step.label}
              </div>
              <h3 className="mt-4 font-medium text-[var(--text)]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-dim)]">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
