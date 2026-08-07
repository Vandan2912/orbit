"use client";

import { useEffect, useRef, useState } from "react";

let mermaidInitialized = false;

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mermaid = (await import("mermaid")).default;
      if (!mermaidInitialized) {
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            darkMode: true,
            background: "transparent",
            primaryColor: "#12121e",
            primaryBorderColor: "#33334a",
            primaryTextColor: "#f2f2f7",
            lineColor: "#5eead4",
            secondaryColor: "#1a1a2e",
            tertiaryColor: "#0d0d16",
            fontFamily: "var(--font-geist-mono), monospace",
          },
        });
        mermaidInitialized = true;
      }
      try {
        const id = `diagram-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) setSvg("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  return <div ref={ref} className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}
