import { NextRequest } from "next/server";
import { clearAnalysisCache } from "@/lib/redis";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo") ?? undefined;
  const cleared = await clearAnalysisCache(repo);
  return Response.json({ cleared });
}
