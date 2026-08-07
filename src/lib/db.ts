import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return pool;
}

export type AnalysisRow = {
  id: string;
  repo_url: string;
  detected_stack: unknown;
  generated_yaml: string;
  created_at: string;
};

export async function saveAnalysis(params: {
  repoUrl: string;
  detectedStack: unknown;
  generatedYaml: string;
}): Promise<AnalysisRow> {
  const { rows } = await getPool().query<AnalysisRow>(
    `insert into analyses (repo_url, detected_stack, generated_yaml)
     values ($1, $2, $3)
     returning id, repo_url, detected_stack, generated_yaml, created_at`,
    [params.repoUrl, JSON.stringify(params.detectedStack), params.generatedYaml],
  );
  return rows[0];
}

export async function listRecentAnalyses(limit = 10): Promise<AnalysisRow[]> {
  const { rows } = await getPool().query<AnalysisRow>(
    `select id, repo_url, detected_stack, generated_yaml, created_at
     from analyses
     order by created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}
