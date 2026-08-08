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
import { saveDeployment } from "@/lib/db";
import { forkRepo, commitZeropsYaml } from "@/lib/github-fork";
import { ZeropsClient } from "@/lib/zerops-client";
import { managedServiceVersion, MANAGED_SERVICE_CATALOG } from "@/lib/zerops-catalog";
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

/**
 * Adds Zerops cross-service env refs for detected managed services onto the primary app
 * service — only for ones we'll actually provision. A ref to a hostname that's never
 * created just resolves to nothing at runtime rather than crashing, but there's no
 * reason to inject a reference to a service that isn't going to exist.
 */
function withManagedServiceRefs(stack: DetectedStack): DetectedStack {
  const provisionable = stack.managedServices.filter((svc) => managedServiceVersion(svc.type));
  if (provisionable.length === 0) return stack;
  const [primary, ...rest] = stack.services;
  const refs = provisionable.map((svc) => ({
    key: `${svc.hostname.toUpperCase()}_CONNECTION_STRING`,
    value: `\${${svc.hostname}_connectionString}`,
  }));
  return {
    ...stack,
    services: [{ ...primary, envVariables: [...primary.envVariables, ...refs] }, ...rest],
  };
}

/**
 * Forces port-related env vars to match the declared port, deterministically, rather
 * than trusting Gemini to guess an app's actual fallback default (it never sees source
 * files, only manifests — asking it to "figure out the real fallback" invites
 * hallucination, e.g. guessing the generic Express default 5000 for an app whose real
 * fallback is 5006). PORT covers the overwhelming majority of frameworks (Node/Express,
 * Django, Rails, Go net/http, ...), but not all of them use that exact name — confirmed
 * against a real failure: Spring Boot reads SERVER_PORT, not PORT, and 502'd until this
 * was added. Set every convention we know about; unused ones are harmless.
 */
function withForcedPort(stack: DetectedStack): DetectedStack {
  const [primary, ...rest] = stack.services;
  const port = String(primary.ports[0] ?? 3000);
  const isJava = /java|kotlin|spring/i.test(`${primary.language} ${primary.framework}`);

  const forced = [{ key: "PORT", value: port }, ...(isJava ? [{ key: "SERVER_PORT", value: port }] : [])];
  const forcedKeys = new Set(forced.map((e) => e.key));
  const envVariables = [...primary.envVariables.filter((e) => !forcedKeys.has(e.key)), ...forced];
  return { ...stack, services: [{ ...primary, envVariables }, ...rest] };
}

const HEALTH_CHECK_ATTEMPTS = 10;
const HEALTH_CHECK_INTERVAL_MS = 8000; // ~80s total — JVM apps (Spring Boot etc) can take
// 20-40s+ to cold-start on a shared-core container; confirmed against a real failure
// where the old 4-attempt/~15s window gave up before the app had finished booting.

async function checkHealth(url: string): Promise<{ ok: boolean; detail: string }> {
  for (let i = 0; i < HEALTH_CHECK_ATTEMPTS; i++) {
    if (i > 0) await sleep(HEALTH_CHECK_INTERVAL_MS);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      if (res.status < 500) return { ok: true, detail: `HTTP ${res.status}` };
      if (i === HEALTH_CHECK_ATTEMPTS - 1) return { ok: false, detail: `HTTP ${res.status} from the live URL` };
    } catch (err) {
      if (i === HEALTH_CHECK_ATTEMPTS - 1) {
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
            const note = MANAGED_SERVICE_CATALOG[svc.type]?.note ?? "not supported yet";
            send({
              step: "provisioning",
              message: `Detected ${svc.hostname} (${svc.type}) but can't auto-provision it — ${note}. We'll add support for this in a future update; add it manually in the Zerops dashboard for now.`,
            });
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
            // Confirmed across two independent test runs: attempt 1 against a git
            // source always builds normally (~2min), but any retry against that SAME
            // git URL right after the previous attempt's service was deleted fails in
            // under 100ms with the build pipeline never actually starting — looks like
            // a backend-side lock/cooldown tied to the git source, not a real build
            // error. 8s wasn't enough; giving it much more room before retrying.
            await sleep(35000);
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

        await saveDeployment({ repoUrl, liveUrl, attempts: attempt }).catch((err) =>
          console.error("Failed to save deployment record:", err),
        );

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
