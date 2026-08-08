import { getStats } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await getStats();
    return Response.json(stats);
  } catch {
    return Response.json({ totalAnalyses: 0, uniqueRepos: 0, lastAnalyzedAt: null });
  }
}
