import { z } from "zod";

export const EnvVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const DetectedServiceSchema = z.object({
  name: z.string().describe("short hostname-safe service name, e.g. 'web', 'api', 'worker'"),
  role: z.enum(["frontend", "api", "worker", "static"]),
  language: z.string().describe("e.g. nodejs, python, go, php, dotnet"),
  framework: z.string().describe("framework name, or empty string if none"),
  zeropsBase: z.string().describe("Zerops runtime base string, e.g. 'nodejs@22', 'python@3.12', 'go@1.22'"),
  buildCommands: z.array(z.string()),
  startCommand: z.string(),
  ports: z.array(z.number().int().min(10).max(65435)),
  envVariables: z.array(EnvVarSchema).default([]),
  reasoning: z.string().describe("one sentence on why this service was detected"),
});

export const DetectedManagedServiceSchema = z.object({
  type: z.enum(["postgresql", "mysql", "mongodb", "valkey", "elasticsearch", "rabbitmq", "objectstorage", "nats"]),
  hostname: z.string(),
  reasoning: z.string(),
});

export const DetectedStackSchema = z.object({
  services: z.array(DetectedServiceSchema).min(1),
  managedServices: z.array(DetectedManagedServiceSchema).default([]),
  summary: z.string().describe("2-3 sentence plain-English summary of the detected architecture"),
});

export type DetectedService = z.infer<typeof DetectedServiceSchema>;
export type DetectedManagedService = z.infer<typeof DetectedManagedServiceSchema>;
export type DetectedStack = z.infer<typeof DetectedStackSchema>;

export type ProgressEvent =
  | { step: "fetching-tree"; message: string }
  | { step: "reading-manifests"; message: string }
  | { step: "analyzing"; message: string }
  | { step: "generating-yaml"; message: string }
  | { step: "done"; result: { detectedStack: DetectedStack; yaml: string; diagram: string } }
  | { step: "error"; message: string };

export type DeployProgressEvent =
  | { step: "forking"; message: string }
  | { step: "committing"; message: string }
  | { step: "provisioning"; message: string }
  | { step: "building"; message: string; attempt: number }
  | { step: "healing"; message: string; attempt: number }
  | { step: "done"; url: string; projectId: string; attempts: number }
  | { step: "failed"; message: string; attempts: number }
  | { step: "error"; message: string };
