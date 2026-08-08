export type LogLine = { time: string; tag: string; color: string; message: string };

const STEP_TAGS: Record<string, { tag: string; color: string }> = {
  "fetching-tree": { tag: "FETCH", color: "var(--cyan)" },
  "reading-manifests": { tag: "READ", color: "var(--cyan)" },
  analyzing: { tag: "ANALYZE", color: "var(--violet)" },
  "generating-yaml": { tag: "BUILD", color: "var(--amber)" },
  forking: { tag: "FORK", color: "var(--violet)" },
  committing: { tag: "COMMIT", color: "var(--violet)" },
  provisioning: { tag: "PROVISION", color: "var(--cyan)" },
  building: { tag: "BUILD", color: "var(--amber)" },
  healing: { tag: "HEAL", color: "var(--rose)" },
};

export function makeLogLine(step: string, message: string): LogLine {
  const meta = STEP_TAGS[step] ?? { tag: step.toUpperCase(), color: "var(--text-dim)" };
  return {
    time: new Date().toUTCString().slice(17, 25),
    tag: meta.tag,
    color: meta.color,
    message,
  };
}
