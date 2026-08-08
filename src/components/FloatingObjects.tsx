"use client";

import { useEffect, useRef } from "react";

type Shape = "ring" | "hex" | "cross" | "diamond" | "dot";

const OBJECTS: { id: number; shape: Shape; top: string; left: string; size: number; depth: number; duration: number; color: string }[] = [
  { id: 1, shape: "ring", top: "12%", left: "8%", size: 34, depth: 22, duration: 22, color: "var(--cyan)" },
  { id: 2, shape: "hex", top: "68%", left: "12%", size: 26, depth: 14, duration: 28, color: "var(--violet)" },
  { id: 3, shape: "cross", top: "22%", left: "88%", size: 18, depth: 30, duration: 18, color: "var(--cyan)" },
  { id: 4, shape: "diamond", top: "78%", left: "85%", size: 20, depth: 18, duration: 24, color: "var(--amber)" },
  { id: 5, shape: "dot", top: "40%", left: "92%", size: 8, depth: 36, duration: 16, color: "var(--cyan)" },
  { id: 6, shape: "ring", top: "85%", left: "45%", size: 20, depth: 12, duration: 30, color: "var(--violet)" },
  { id: 7, shape: "dot", top: "8%", left: "45%", size: 6, depth: 26, duration: 20, color: "var(--amber)" },
];

function ShapeSvg({ shape, size, color }: { shape: Shape; size: number; color: string }) {
  const common = { width: size, height: size, stroke: color, fill: "none", strokeWidth: 1.4 };
  switch (shape) {
    case "ring":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
        </svg>
      );
    case "hex":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" />
        </svg>
      );
    case "cross":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <polygon points="12,2 22,12 12,22 2,12" />
        </svg>
      );
    case "dot":
      return <div style={{ width: size, height: size, borderRadius: "9999px", background: color, boxShadow: `0 0 ${size}px ${color}` }} />;
  }
}

export function FloatingObjects() {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        const el = ref.current;
        if (!el) return;
        const mx = (e.clientX / window.innerWidth - 0.5) * 2;
        const my = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty("--mx", mx.toFixed(3));
        el.style.setProperty("--my", my.toFixed(3));
      });
    }
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ ["--mx" as string]: "0", ["--my" as string]: "0" }}>
      {OBJECTS.map((obj) => (
        <div
          key={obj.id}
          className="absolute"
          style={{
            top: obj.top,
            left: obj.left,
            transform: `translate(calc(var(--mx) * ${obj.depth}px), calc(var(--my) * ${obj.depth}px))`,
            transition: "transform 0.15s ease-out",
          }}
        >
          <div
            className="opacity-60"
            style={{ animation: `drift-${obj.id % 3} ${obj.duration}s ease-in-out infinite` }}
          >
            <ShapeSvg shape={obj.shape} size={obj.size} color={obj.color} />
          </div>
        </div>
      ))}
    </div>
  );
}
