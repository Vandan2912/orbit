import { listRecentAnalyses } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const rows = await listRecentAnalyses(10);
    return Response.json({ analyses: rows });
  } catch {
    return Response.json({ analyses: [] });
  }
}
