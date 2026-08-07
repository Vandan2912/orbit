import { GoogleGenAI, FunctionCallingConfigMode, Type, type FunctionDeclaration } from "@google/genai";
import { DetectedStackSchema, type DetectedStack } from "./types";

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const REPORT_TOOL: FunctionDeclaration = {
  name: "report_detected_stack",
  description: "Report the detected architecture for this repository as structured data.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      services: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            role: { type: Type.STRING, enum: ["frontend", "api", "worker", "static"] },
            language: { type: Type.STRING },
            framework: { type: Type.STRING, description: "framework name, or empty string if none" },
            zeropsBase: { type: Type.STRING },
            buildCommands: { type: Type.ARRAY, items: { type: Type.STRING } },
            startCommand: { type: Type.STRING },
            ports: { type: Type.ARRAY, items: { type: Type.INTEGER } },
            envVariables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
                required: ["key", "value"],
              },
            },
            reasoning: { type: Type.STRING },
          },
          required: ["name", "role", "language", "framework", "zeropsBase", "buildCommands", "startCommand", "ports", "reasoning"],
        },
      },
      managedServices: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ["postgresql", "mysql", "mongodb", "valkey", "elasticsearch", "rabbitmq", "objectstorage", "nats"],
            },
            hostname: { type: Type.STRING },
            reasoning: { type: Type.STRING },
          },
          required: ["type", "hostname", "reasoning"],
        },
      },
      summary: { type: Type.STRING },
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

  const response = await client.models.generateContent({
    model: "gemini-flash-latest",
    contents: `Repository: ${params.repoUrl}\n\nFile tree (sample):\n${treeSample}\n\nManifest files:\n${manifestBlocks}`,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: [REPORT_TOOL] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: ["report_detected_stack"],
        },
      },
    },
  });

  const call = response.functionCalls?.[0];
  if (!call) {
    throw new Error("Gemini did not return a structured analysis");
  }
  return DetectedStackSchema.parse(call.args);
}
