import { GoogleGenAI, FunctionCallingConfigMode, Type, type FunctionDeclaration } from "@google/genai";
import { DetectedStackSchema, type DetectedStack } from "./types";
import { RUNTIME_CATALOG, MANAGED_SERVICE_SUMMARY } from "./zerops-catalog";

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
              enum: [
                "postgresql",
                "mysql",
                "mongodb",
                "valkey",
                "elasticsearch",
                "rabbitmq",
                "objectstorage",
                "nats",
                "kafka",
                "meilisearch",
                "typesense",
                "qdrant",
                "clickhouse",
              ],
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
zerops.yaml with a "base" runtime string).

${RUNTIME_CATALOG}

Infer real, working build and start commands from the actual manifest contents
(package.json scripts, requirements.txt, go.mod, etc) — don't guess generically.

Managed services — only report one if there's real evidence for it (a DB client
dependency, a DATABASE_URL-shaped env var, a redis client, etc). Current support:
${MANAGED_SERVICE_SUMMARY}
Still report a detected type even if it's not supported yet (e.g. mongodb, rabbitmq) —
say so plainly in its reasoning field so the user knows it was recognized but can't be
auto-provisioned; don't substitute a different database/broker just because it's
supported instead.

Go repos with a CGO-linked native dependency (classic case: gorm.io/driver/sqlite, backed
by mattn/go-sqlite3) will compile fine even with CGO disabled, but panic at runtime the
instant the code path that uses it executes — before the server ever binds its port,
so the deployed app silently never serves traffic. If go.mod/go.sum shows one, set a
build env var CGO_ENABLED=1 AND add a buildCommands step that installs a C toolchain
before running "go build", e.g.:
"sh -c 'command -v apk >/dev/null 2>&1 && apk add --no-cache gcc musl-dev || (command -v apt-get >/dev/null 2>&1 && apt-get update && apt-get install -y gcc libc6-dev) || true'"
as the first buildCommand.

Keep service names short, lowercase, hostname-safe. Call report_detected_stack exactly
once with your findings.`;

async function reportStack(systemPrompt: string, userPrompt: string): Promise<DetectedStack> {
  const response = await client.models.generateContent({
    model: "gemini-flash-latest",
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
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

export async function analyzeRepo(params: {
  repoUrl: string;
  fileTree: string[];
  manifests: Record<string, string>;
}): Promise<DetectedStack> {
  const treeSample = params.fileTree.slice(0, 300).join("\n");
  const manifestBlocks = Object.entries(params.manifests)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");

  return reportStack(
    SYSTEM_PROMPT,
    `Repository: ${params.repoUrl}\n\nFile tree (sample):\n${treeSample}\n\nManifest files:\n${manifestBlocks}`,
  );
}

const SELF_HEAL_SYSTEM_PROMPT = `You previously proposed a Zerops deployment config for a
repository and either the build failed, or it built but the deployed app didn't actually
serve traffic (a live HTTP check against it failed). Zerops's public API does not expose
granular build stdout/stderr, only pass/fail plus whatever health-check result is given
below — so reason from common root causes:

${RUNTIME_CATALOG}

- Build failures: wrong runtime base version — use ONLY a string from the list above,
  never invent one; a build command that doesn't match the actual package manager/
  lockfile in the repo (e.g. running npm when there's only a pnpm-lock.yaml); a monorepo
  where the buildable app lives in a subdirectory so commands must cd into it and
  deployFiles must point at the right output.
- "Built but not serving" failures: the calling code already forces PORT (and SERVER_PORT
  for JVM/Spring apps) to match the declared port deterministically — don't guess a port
  *number*. But not every framework uses one of those two names: if you recognize this
  app's language/framework reads a different env var for its port (anything outside
  Node/Django/Rails/Go and JVM/Spring, which are already handled), add that env var
  yourself, set to the same value as the declared port. Also check whether the start
  command actually launches the right entrypoint, or whether the declared port itself
  is wrong (e.g. a static/webserver-style service that should use 80/8080 by convention).
- Go apps that "build fine but never serve": if go.mod/go.sum shows a CGO-linked native
  dependency (classic case: gorm.io/driver/sqlite, which is backed by mattn/go-sqlite3),
  the binary compiles successfully even when CGO is disabled, but panics the instant the
  code path that opens the database runs — before the server ever binds its port. Fix by
  adding a build env var CGO_ENABLED=1 AND a buildCommands step that installs a C
  toolchain before running "go build", e.g.:
  "sh -c 'command -v apk >/dev/null 2>&1 && apk add --no-cache gcc musl-dev || (command -v apt-get >/dev/null 2>&1 && apt-get update && apt-get install -y gcc libc6-dev) || true'"
  as the first buildCommand. The same pattern applies to any other Go dependency that
  needs cgo (look for "/cgo" imports or known cgo-only drivers in go.mod).
Produce a corrected, more conservative report_detected_stack call. Keep whatever was
clearly correct; fix what's most likely to have broken it.`;

export async function regenerateStackOnFailure(params: {
  repoUrl: string;
  fileTree: string[];
  manifests: Record<string, string>;
  previousStack: DetectedStack;
  attempt: number;
  failureHint?: string;
}): Promise<DetectedStack> {
  const treeSample = params.fileTree.slice(0, 300).join("\n");
  const manifestBlocks = Object.entries(params.manifests)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");

  return reportStack(
    SELF_HEAL_SYSTEM_PROMPT,
    `Repository: ${params.repoUrl}\n\nThis is retry attempt ${params.attempt}.\n\n` +
      (params.failureHint ? `What went wrong: ${params.failureHint}\n\n` : "") +
      `Previous (failed) detected stack:\n${JSON.stringify(params.previousStack, null, 2)}\n\n` +
      `File tree (sample):\n${treeSample}\n\nManifest files:\n${manifestBlocks}`,
  );
}
