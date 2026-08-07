import Anthropic from "@anthropic-ai/sdk";
import { DetectedStackSchema, type DetectedStack } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_detected_stack",
  description: "Report the detected architecture for this repository as structured data.",
  input_schema: {
    type: "object",
    properties: {
      services: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string", enum: ["frontend", "api", "worker", "static"] },
            language: { type: "string" },
            framework: { type: ["string", "null"] },
            zeropsBase: { type: "string" },
            buildCommands: { type: "array", items: { type: "string" } },
            startCommand: { type: "string" },
            ports: { type: "array", items: { type: "integer" } },
            envVariables: { type: "object", additionalProperties: { type: "string" } },
            reasoning: { type: "string" },
          },
          required: ["name", "role", "language", "framework", "zeropsBase", "buildCommands", "startCommand", "ports", "reasoning"],
        },
      },
      managedServices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["postgresql", "mysql", "mongodb", "valkey", "elasticsearch", "rabbitmq", "objectstorage", "nats"],
            },
            hostname: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["type", "hostname", "reasoning"],
        },
      },
      summary: { type: "string" },
    },
    required: ["services", "managedServices", "summary"],
  },
};

const SYSTEM_PROMPT = `You analyze a GitHub repository's file tree and manifest files to infer what
services it needs to run on Zerops (a PaaS where each runtime service is described by a
zerops.yaml with a "base" runtime string like "nodejs@22", "python@3.12", "go@1.22",
"php@8.3", "static", etc). Infer real, working build and start commands from the actual
manifest contents (package.json scripts, requirements.txt, go.mod, etc) — don't guess
generically. Only include a managed service (postgresql, valkey, etc) if there's real
evidence for it (a DB client dependency, a DATABASE_URL-shaped env var, a redis client,
etc). Keep service names short, lowercase, hostname-safe. Call report_detected_stack
exactly once with your findings.`;

export async function analyzeRepo(params: {
  repoUrl: string;
  fileTree: string[];
  manifests: Record<string, string>;
}): Promise<DetectedStack> {
  const treeSample = params.fileTree.slice(0, 300).join("\n");
  const manifestBlocks = Object.entries(params.manifests)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "report_detected_stack" },
    messages: [
      {
        role: "user",
        content: `Repository: ${params.repoUrl}\n\nFile tree (sample):\n${treeSample}\n\nManifest files:\n${manifestBlocks}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new Error("Claude did not return a structured analysis");
  }
  return DetectedStackSchema.parse(toolUse.input);
}
