import { Pool } from "pg";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function ensureSchema(p: Pool): Promise<void> {
  if (!schemaReady) {
    schemaReady = p
      .query(
        `create extension if not exists pgcrypto;
         create table if not exists analyses (
           id uuid primary key default gen_random_uuid(),
           repo_url text not null,
           detected_stack jsonb not null,
           generated_yaml text not null,
           created_at timestamptz not null default now()
         );
         create index if not exists analyses_repo_url_idx on analyses (repo_url);
         create index if not exists analyses_created_at_idx on analyses (created_at desc);`,
      )
      .then(() => undefined);
  }
  return schemaReady;
}

export async function getPool(): Promise<Pool> {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  await ensureSchema(pool);
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
  const pool = await getPool();
  const { rows } = await pool.query<AnalysisRow>(
    `insert into analyses (repo_url, detected_stack, generated_yaml)
     values ($1, $2, $3)
     returning id, repo_url, detected_stack, generated_yaml, created_at`,
    [params.repoUrl, JSON.stringify(params.detectedStack), params.generatedYaml],
  );
  return rows[0];
}

export async function listRecentAnalyses(limit = 10): Promise<AnalysisRow[]> {
  const pool = await getPool();
  const { rows } = await pool.query<AnalysisRow>(
    `select id, repo_url, detected_stack, generated_yaml, created_at
     from analyses
     order by created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}
