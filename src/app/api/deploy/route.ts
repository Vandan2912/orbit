import { NextRequest } from "next/server";
import {
  parseRepoUrl,
  fetchDefaultBranch,
  fetchFileTree,
  fetchFileContents,
  pickManifestPaths,
} from "@/lib/github";
import { analyzeRepo, regenerateStackOnFailure } from "@/lib/analyze";
import { generateZeropsYaml } from "@/lib/yaml-gen";
import { getCachedAnalysis } from "@/lib/redis";
import { forkRepo, commitZeropsYaml } from "@/lib/github-fork";
import { ZeropsClient, managedServiceVersion } from "@/lib/zerops-client";
import type { DeployProgressEvent, DetectedStack } from "@/lib/types";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 8000;
const MAX_POLLS_PER_ATTEMPT = 45; // ~6 min

function sseEvent(event: DeployProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Adds Zerops cross-service env refs for detected managed services onto the primary app service. */
function withManagedServiceRefs(stack: DetectedStack): DetectedStack {
  if (stack.managedServices.length === 0) return stack;
  const [primary, ...rest] = stack.services;
  const refs = stack.managedServices.map((svc) => ({
    key: `${svc.hostname.toUpperCase()}_CONNECTION_STRING`,
    value: `\${${svc.hostname}_connectionString}`,
  }));
  return {
    ...stack,
    services: [{ ...primary, envVariables: [...primary.envVariables, ...refs] }, ...rest],
  };
}

async function pollUntilSettled(
  zerops: ZeropsClient,
  serviceStackId: string,
  onTick: (elapsedSeconds: number, tickIndex: number) => void,
): Promise<"success" | "failure" | "timeout"> {
  for (let i = 0; i < MAX_POLLS_PER_ATTEMPT; i++) {
    await sleep(POLL_INTERVAL_MS);
    onTick((i + 1) * (POLL_INTERVAL_MS / 1000), i + 1);
    const versions = await zerops.listAppVersions(serviceStackId);
    const latest = versions.list[0];
    if (!latest) continue;
    if (latest.status === "ACTIVE") return "success";
    if (/FAIL/i.test(latest.status)) return "failure";
  }
  return "timeout";
}

export async function POST(req: NextRequest) {
  const { repoUrl, zeropsApiToken } = (await req.json()) as {
    repoUrl?: string;
    zeropsApiToken?: string;
  };
  if (!repoUrl || !zeropsApiToken) {
    return new Response("Missing repoUrl or zeropsApiToken", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DeployProgressEvent) => controller.enqueue(sseEvent(event));
      try {
        const ref = parseRepoUrl(repoUrl);
        const branch = await fetchDefaultBranch(ref);
        const cacheKey = `${ref.owner}/${ref.repo}@${branch}`;

        let detectedStack: DetectedStack;
        const cached = await getCachedAnalysis(cacheKey).catch(() => null);
        const tree = await fetchFileTree(ref, branch);
        const manifestPaths = pickManifestPaths(tree);
        const manifests = await fetchFileContents(ref, branch, manifestPaths);

        if (cached) {
          detectedStack = (JSON.parse(cached) as { detectedStack: DetectedStack }).detectedStack;
        } else {
          detectedStack = await analyzeRepo({ repoUrl, fileTree: tree, manifests });
        }
        detectedStack = withManagedServiceRefs(detectedStack);

        send({ step: "forking", message: `Forking ${ref.owner}/${ref.repo} so Orbit can commit a zerops.yaml without touching the original` });
        const fork = await forkRepo(ref.owner, ref.repo);

        const zerops = new ZeropsClient(zeropsApiToken);
        const { clientId } = await zerops.getClientId();

        send({ step: "provisioning", message: "Creating a Zerops project" });
        const projectName = `orbit-${ref.repo}`.slice(0, 60).toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const project = await zerops.createProject(clientId, projectName);

        for (const svc of detectedStack.managedServices) {
          const version = managedServiceVersion(svc.type);
          if (!version) {
            send({ step: "provisioning", message: `Skipping ${svc.hostname} (${svc.type}) — no default version mapping yet` });
            continue;
          }
          send({ step: "provisioning", message: `Provisioning managed service ${svc.hostname} (${svc.type})` });
          await zerops.createServiceStack(project.id, { name: svc.hostname, serviceStackVersionName: version });
        }

        const primary = detectedStack.services[0];
        let attempt = 1;
        let currentServiceStackId: string | null = null;
        let outcome: "success" | "failure" | "timeout" = "failure";

        while (attempt <= MAX_ATTEMPTS) {
          const yamlText = generateZeropsYaml({ ...detectedStack, services: [primary] });

          send({ step: "committing", message: `Committing zerops.yaml to the fork (attempt ${attempt})` });
          await commitZeropsYaml({
            login: fork.login,
            repo: fork.repo,
            branch: fork.defaultBranch,
            content: yamlText,
            message: `Orbit: deploy config (attempt ${attempt})`,
          });

          send({ step: "building", message: `Building ${primary.name} from the fork`, attempt });
          const created = await zerops.createServiceStack(project.id, {
            name: primary.name,
            serviceStackVersionName: primary.zeropsBase,
            buildFromGit: `https://github.com/${fork.login}/${fork.repo}`,
            enableSubdomainAccess: true,
          });
          currentServiceStackId = created.id;
          if (!currentServiceStackId) throw new Error("Zerops did not return the new service's id");

          outcome = await pollUntilSettled(zerops, currentServiceStackId, (elapsedSeconds, tickIndex) => {
            // Write bytes on every tick so the SSE connection never sits idle long
            // enough for a proxy to kill it; only surface a visible line every 3rd tick.
            if (tickIndex % 3 === 0) {
              send({ step: "building", message: `Still building… (${elapsedSeconds}s elapsed)`, attempt });
            } else {
              controller.enqueue(": heartbeat\n\n");
            }
          });
          if (outcome === "success") break;

          if (attempt < MAX_ATTEMPTS) {
            send({
              step: "healing",
              message:
                outcome === "timeout"
                  ? "Build is taking too long — regenerating the config and retrying"
                  : "Build failed — asking Gemini to regenerate the config and retrying",
              attempt,
            });
            const healed = await regenerateStackOnFailure({
              repoUrl,
              fileTree: tree,
              manifests,
              previousStack: { ...detectedStack, services: [primary] },
              attempt,
            });
            detectedStack = withManagedServiceRefs({ ...healed, managedServices: detectedStack.managedServices });
            await zerops.deleteServiceStack(currentServiceStackId).catch(() => {});
          }
          attempt++;
        }

        if (outcome !== "success" || !currentServiceStackId) {
          send({ step: "failed", message: `Gave up after ${attempt <= MAX_ATTEMPTS ? attempt : MAX_ATTEMPTS} attempts`, attempts: Math.min(attempt, MAX_ATTEMPTS) });
          controller.close();
          return;
        }

        const url = await zerops.getSubdomainUrl(currentServiceStackId);
        send({ step: "done", url: url ?? "(check the Zerops dashboard for the URL)", projectId: project.id, attempts: attempt });
        controller.close();
      } catch (err) {
        send({ step: "error", message: err instanceof Error ? err.message : "Unknown error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
