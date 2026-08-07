import type { DetectedStack } from "./types";

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function generateMermaidDiagram(stack: DetectedStack): string {
  const lines = ["flowchart LR", "  internet((Internet))"];

  const httpRoles = new Set(["frontend", "api", "static"]);

  for (const service of stack.services) {
    const id = sanitizeId(service.name);
    const label = `${service.name}\\n${service.language}${service.framework ? " · " + service.framework : ""}`;
    lines.push(`  ${id}["${label}"]`);
    if (httpRoles.has(service.role)) {
      lines.push(`  internet --> ${id}`);
    }
  }

  const apiLike = stack.services.filter((s) => s.role === "api" || s.role === "worker");
  const frontends = stack.services.filter((s) => s.role === "frontend");
  for (const fe of frontends) {
    for (const api of apiLike) {
      lines.push(`  ${sanitizeId(fe.name)} --> ${sanitizeId(api.name)}`);
    }
  }

  for (const svc of stack.managedServices) {
    const id = sanitizeId(svc.hostname);
    lines.push(`  ${id}[("${svc.hostname}\\n${svc.type}")]`);
    for (const service of stack.services) {
      if (service.role === "api" || service.role === "worker") {
        lines.push(`  ${sanitizeId(service.name)} -.private network.-> ${id}`);
      }
    }
  }

  return lines.join("\n");
}
