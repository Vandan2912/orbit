/**
 * Ground truth for what Zerops actually offers, pulled from the live
 * GET /settings response (serviceStackList) on 2026-08-08 — not guessed. Guessing here
 * has caused real, confirmed failures: "mysql:single@8" doesn't exist (MySQL
 * compatibility is served via MariaDB; the literal "mysql" type has exactly one
 * version and it's DISABLED), and a bare "php@x" would fail too (there is no plain
 * "php" runtime, only php-nginx/php-apache). Single source of truth for both the
 * Gemini prompt and the actual provisioning code — they must not drift apart again.
 */

export const RUNTIME_CATALOG = `
Valid Zerops runtime bases (use exactly one of these strings for zeropsBase — an os
prefix like "alpine/" or "ubuntu/" is optional and can be omitted):
- nodejs@20, nodejs@22, nodejs@24
- python@3.11, python@3.12, python@3.14
- go@1.22  (NOT "golang@..." — the software name in the string is "go")
- php-nginx@8.3, php-nginx@8.4, php-nginx@8.5  (webserver-style; no plain "php@x" exists)
- php-apache@8.1, php-apache@8.3, php-apache@8.4, php-apache@8.5
- java@17, java@21
- dotnet@8, dotnet@9, dotnet@10
- ruby@3.3, ruby@3.4, ruby@4.0
- rust@stable, rust@nightly
- bun@1.2.2, bun@1.3.9
- deno@2.0.0
- elixir@1.16.3
- gleam@1.5.1
- static@1.0  (static sites/SPAs with no server process)
- nginx@1.22  (generic webserver, not PHP-specific)
- docker@26.1.5  (raw Dockerfile-based builds)
If a repo needs something outside this list, pick the closest match and say so in
reasoning rather than inventing a version string.
`.trim();

export type ManagedServiceCatalogEntry = {
  /** The exact serviceStackVersionName to use when provisioning, or null if unsupported. */
  version: string | null;
  note: string;
};

export const MANAGED_SERVICE_CATALOG: Record<string, ManagedServiceCatalogEntry> = {
  postgresql: { version: "postgresql:single@16", note: "Postgres" },
  mysql: { version: "mariadb:single@10.6", note: "MySQL-compatible, served via MariaDB" },
  valkey: { version: "valkey:single@7.2", note: "Redis-compatible cache" },
  elasticsearch: { version: "elasticsearch:single@8.16", note: "search" },
  kafka: { version: "kafka:single@3.9", note: "message broker" },
  meilisearch: { version: "meilisearch:single@1.44", note: "search" },
  typesense: { version: "typesense:single@30.2", note: "search" },
  qdrant: { version: "qdrant:single@1.12", note: "vector DB" },
  clickhouse: { version: "clickhouse:single@25.3", note: "analytical DB" },
  objectstorage: { version: "object-storage", note: "S3-compatible (MinIO-based)" },
  mongodb: { version: null, note: "not offered by Zerops as a managed service yet" },
  rabbitmq: { version: null, note: "not offered by Zerops as a managed service yet (NATS or Kafka cover message-broker needs)" },
  nats: { version: "nats:single@2.10", note: "message broker" },
};

export function managedServiceVersion(type: string): string | null {
  return MANAGED_SERVICE_CATALOG[type]?.version ?? null;
}

export const MANAGED_SERVICE_SUMMARY = Object.entries(MANAGED_SERVICE_CATALOG)
  .map(([type, entry]) => `- ${type}: ${entry.version ? "supported" : "NOT supported yet"} (${entry.note})`)
  .join("\n");
