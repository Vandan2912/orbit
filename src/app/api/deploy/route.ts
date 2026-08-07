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

/**
 * Forces PORT to match the declared port, deterministically, rather than trusting
 * Gemini to guess an app's actual fallback default (it never sees source files, only
 * manifests — asking it to "figure out the real fallback" invites hallucination, e.g.
 * guessing the generic Express default 5000 for an app whose real fallback is 5006).
 * Almost every Node/Express/etc app that reads process.env.PORT will bind to whatever
 * is set here, so this alone fixes the overwhelming majority of port-mismatch failures.
 */
function withForcedPort(stack: DetectedStack): DetectedStack {
  const [primary, ...rest] = stack.services;
  const port = String(primary.ports[0] ?? 3000);
  const envVariables = [...primary.envVariables.filter((e) => e.key !== "PORT"), { key: "PORT", value: port }];
  return { ...stack, services: [{ ...primary, envVariables }, ...rest] };
}

async function checkHealth(url: string): Promise<{ ok: boolean; detail: string }> {
  for (let i = 0; i < 4; i++) {
    if (i > 0) await sleep(5000);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      if (res.status < 500) return { ok: true, detail: `HTTP ${res.status}` };
      if (i === 3) return { ok: false, detail: `HTTP ${res.status} from the live URL` };
    } catch (err) {
      if (i === 3) {
        return { ok: false, detail: err instanceof Error ? err.message : "connection failed" };
      }
    }
  }
  return { ok: false, detail: "unreachable" };
}

async function pollUntilSettled(
  zerops: ZeropsClient,
  serviceStackId: string,
  onTick: (elapsedSeconds: number, tickIndex: number) => void,
): Promise<"success" | "failure" | "timeout"> {
  // The app-version's own `status` field is unreliable — observed stuck at
  // WAITING_TO_BUILD even after the underlying build process had already FAILED.
  // The per-service-stack process list reflects the real pipeline state instead.
  for (let i = 0; i < MAX_POLLS_PER_ATTEMPT; i++) {
    await sleep(POLL_INTERVAL_MS);
    onTick((i + 1) * (POLL_INTERVAL_MS / 1000), i + 1);
    const { list } = await zerops.listServiceStackProcesses(serviceStackId);
    const build = list.find((p) => p.actionName === "stack.build");
    if (!build) continue;
    if (build.status === "FINISHED") return "success";
    if (build.status === "FAILED" || build.status === "CANCELED") return "failure";
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
        detectedStack = withForcedPort(withManagedServiceRefs(detectedStack));

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
        let liveUrl: string | null = null;
        let failureHint = "";

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

          // A unique name per attempt avoids racing the previous attempt's (best-effort,
          // non-blocking) deletion — Zerops rejects a same-named service stack that
          // hasn't finished being torn down yet.
          const attemptServiceName = attempt === 1 ? primary.name : `${primary.name}${attempt}`;
          send({ step: "building", message: `Building ${attemptServiceName} from the fork`, attempt });
          const created = await zerops.createServiceStack(project.id, {
            name: attemptServiceName,
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

          if (outcome === "success") {
            send({ step: "building", message: "Build succeeded — checking whether the app actually serves traffic", attempt });
            liveUrl = await zerops.getSubdomainUrl(currentServiceStackId);
            const health = liveUrl ? await checkHealth(liveUrl) : { ok: false, detail: "no subdomain URL returned" };
            if (health.ok) break;
            outcome = "failure";
            failureHint = `The build succeeded and deployed, but a live HTTP check against the app failed: ${health.detail}. This is almost always a port mismatch — Zerops doesn't auto-set a PORT env var, so if the app reads process.env.PORT with a different fallback than the declared port, it won't be reachable.`;
          } else {
            failureHint =
              outcome === "timeout"
                ? "The build did not finish within the time budget."
                : "The build itself failed (non-zero exit from a build or start command).";
          }

          if (attempt < MAX_ATTEMPTS) {
            send({ step: "healing", message: `${failureHint} Asking Gemini to regenerate the config and retrying.`, attempt });
            const healed = await regenerateStackOnFailure({
              repoUrl,
              fileTree: tree,
              manifests,
              previousStack: { ...detectedStack, services: [primary] },
              attempt,
              failureHint,
            });
            detectedStack = withForcedPort(withManagedServiceRefs({ ...healed, managedServices: detectedStack.managedServices }));
            await zerops.deleteServiceStack(currentServiceStackId).catch(() => {});
          }
          attempt++;
        }

        if (outcome !== "success" || !currentServiceStackId || !liveUrl) {
          send({
            step: "failed",
            message: `Gave up after ${Math.min(attempt, MAX_ATTEMPTS)} attempts. ${failureHint}`,
            attempts: Math.min(attempt, MAX_ATTEMPTS),
          });
          controller.close();
          return;
        }

        send({ step: "done", url: liveUrl, projectId: project.id, attempts: attempt });
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
