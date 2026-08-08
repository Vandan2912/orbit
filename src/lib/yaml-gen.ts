import * as yaml from "js-yaml";
import type { DetectedStack, DetectedService } from "./types";
import { managedServiceVersion, MANAGED_SERVICE_CATALOG } from "./zerops-catalog";

function serviceToYamlBlock(service: DetectedService) {
  const isHttp = service.role === "frontend" || service.role === "api" || service.role === "static";
  return {
    setup: service.name,
    build:
      service.buildCommands.length > 0
        ? {
            base: service.zeropsBase,
            buildCommands: service.buildCommands,
            deployFiles: "./",
          }
        : undefined,
    run: {
      base: service.zeropsBase,
      ports: service.ports.map((port) => ({ port, httpSupport: isHttp })),
      start: service.startCommand,
      ...(service.envVariables.length > 0
        ? { envVariables: Object.fromEntries(service.envVariables.map((e) => [e.key, e.value])) }
        : {}),
    },
  };
}

export function generateZeropsYaml(stack: DetectedStack): string {
  const doc = {
    zerops: stack.services.map(serviceToYamlBlock),
  };
  return yaml.dump(doc, { noRefs: true, lineWidth: 100 });
}

export function describeManagedServices(stack: DetectedStack): string {
  if (stack.managedServices.length === 0) return "";
  const lines = stack.managedServices.map((svc) => {
    const supported = managedServiceVersion(svc.type) !== null;
    const status = supported ? "" : ` — NOT YET SUPPORTED for auto-deploy (${MANAGED_SERVICE_CATALOG[svc.type]?.note ?? "coming in a future update"}), add manually`;
    return `# - ${svc.hostname} (${svc.type}): ${svc.reasoning}${status}`;
  });
  return [
    "# Managed services (add these as project services in Zerops, referenced by hostname",
    "# in the app services' envVariables above — they are provisioned separately from",
    "# zerops.yaml, not defined inside it):",
    ...lines,
  ].join("\n");
}
