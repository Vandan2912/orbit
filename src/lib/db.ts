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
         create index if not exists analyses_created_at_idx on analyses (created_at desc);
         create table if not exists deployments (
           id uuid primary key default gen_random_uuid(),
           repo_url text not null,
           live_url text not null,
           attempts integer not null,
           created_at timestamptz not null default now()
         );
         create index if not exists deployments_repo_url_idx on deployments (repo_url);`,
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
  live_url: string | null;
  deployed_at: string | null;
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
    `select a.id, a.repo_url, a.detected_stack, a.generated_yaml, a.created_at,
            d.live_url, d.created_at as deployed_at
     from analyses a
     left join lateral (
       select live_url, created_at
       from deployments
       where deployments.repo_url = a.repo_url
       order by created_at desc
       limit 1
     ) d on true
     order by a.created_at desc
     limit $1`,
    [limit],
  );
  return rows;
}

export async function saveDeployment(params: {
  repoUrl: string;
  liveUrl: string;
  attempts: number;
}): Promise<void> {
  const pool = await getPool();
  await pool.query(
    `insert into deployments (repo_url, live_url, attempts) values ($1, $2, $3)`,
    [params.repoUrl, params.liveUrl, params.attempts],
  );
}

export type Stats = {
  totalAnalyses: number;
  uniqueRepos: number;
  lastAnalyzedAt: string | null;
};

export async function getStats(): Promise<Stats> {
  const pool = await getPool();
  const { rows } = await pool.query<{
    total_analyses: string;
    unique_repos: string;
    last_analyzed_at: string | null;
  }>(
    `select
       count(*) as total_analyses,
       count(distinct repo_url) as unique_repos,
       max(created_at) as last_analyzed_at
     from analyses`,
  );
  const row = rows[0];
  return {
    totalAnalyses: Number(row?.total_analyses ?? 0),
    uniqueRepos: Number(row?.unique_repos ?? 0),
    lastAnalyzedAt: row?.last_analyzed_at ?? null,
  };
}
