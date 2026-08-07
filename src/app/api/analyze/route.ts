import { NextRequest } from "next/server";
import {
  parseRepoUrl,
  fetchDefaultBranch,
  fetchFileTree,
  fetchFileContents,
  pickManifestPaths,
} from "@/lib/github";
import { analyzeRepo } from "@/lib/analyze";
import { generateZeropsYaml, describeManagedServices } from "@/lib/yaml-gen";
import { generateMermaidDiagram } from "@/lib/diagram";
import { getCachedAnalysis, setCachedAnalysis } from "@/lib/redis";
import { saveAnalysis } from "@/lib/db";
import type { ProgressEvent, DetectedStack } from "@/lib/types";

export const runtime = "nodejs";

function sseEvent(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const { repoUrl } = (await req.json()) as { repoUrl?: string };
  if (!repoUrl) {
    return new Response("Missing repoUrl", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => controller.enqueue(sseEvent(event));
      try {
        const ref = parseRepoUrl(repoUrl);
        const branch = await fetchDefaultBranch(ref);
        const cacheKey = `${ref.owner}/${ref.repo}@${branch}`;

        const cached = await getCachedAnalysis(cacheKey).catch(() => null);
        if (cached) {
          const parsed = JSON.parse(cached) as { detectedStack: DetectedStack; yaml: string };
          send({ step: "analyzing", message: "Found a cached analysis for this repo — reusing it" });
          const diagram = generateMermaidDiagram(parsed.detectedStack);
          send({ step: "done", result: { detectedStack: parsed.detectedStack, yaml: parsed.yaml, diagram } });
          controller.close();
          return;
        }

        send({ step: "fetching-tree", message: `Fetching file tree for ${ref.owner}/${ref.repo}@${branch}` });
        const tree = await fetchFileTree(ref, branch);

        send({ step: "reading-manifests", message: "Reading manifest files (package.json, go.mod, ...)" });
        const manifestPaths = pickManifestPaths(tree);
        const manifests = await fetchFileContents(ref, branch, manifestPaths);

        send({ step: "analyzing", message: "Asking Claude to infer the service architecture" });
        const detectedStack = await analyzeRepo({ repoUrl, fileTree: tree, manifests });

        send({ step: "generating-yaml", message: "Generating zerops.yaml and architecture diagram" });
        const yamlText = [generateZeropsYaml(detectedStack), describeManagedServices(detectedStack)]
          .filter(Boolean)
          .join("\n");
        const diagram = generateMermaidDiagram(detectedStack);

        await setCachedAnalysis(cacheKey, JSON.stringify({ detectedStack, yaml: yamlText })).catch((err) =>
          console.error("Failed to cache analysis:", err),
        );
        await saveAnalysis({ repoUrl, detectedStack, generatedYaml: yamlText }).catch((err) =>
          console.error("Failed to save analysis to history:", err),
        );

        send({ step: "done", result: { detectedStack, yaml: yamlText, diagram } });
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
