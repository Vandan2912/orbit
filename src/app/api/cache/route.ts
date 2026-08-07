import { clearAnalysisCache } from "@/lib/redis";

export const runtime = "nodejs";

export async function DELETE() {
  const cleared = await clearAnalysisCache();
  return Response.json({ cleared });
}
