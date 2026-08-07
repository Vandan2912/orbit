# Orbit

An AI deploy copilot for [Zerops](https://zerops.io). Point Orbit at a public GitHub repo
and it:

1. Fetches the file tree and key manifest files (`package.json`, `go.mod`,
   `requirements.txt`, `Dockerfile`, ...) via the GitHub API
2. Sends them to Gemini to infer the service architecture — languages, frameworks,
   build/start commands, ports, and any managed services (Postgres, Redis, etc) it needs
3. Generates a working [`zerops.yaml`](https://docs.zerops.io/zerops-yaml/specification)
   for it
4. Renders a live architecture diagram of the inferred services
5. Streams all of this to the UI in real time as it happens

Built for [The Zerops Challenge](https://www.wemakedevs.org/hackathons/zerops)
(WeMakeDevs × Zerops, Aug 8–9 2026).

## Why this, not a generic app on Zerops

Zerops doesn't ship a tool that analyzes an arbitrary repo and generates its own
`zerops.yaml` — `zerops.yaml` is developer-written, and their own agent platform (ZCP)
works inside a project you've already set up rather than scanning an external repo from
scratch. Orbit fills that gap, and only makes sense in a Zerops context — it isn't "an
app that happens to be hosted here."

## Architecture

Orbit is itself a small multi-service Zerops deployment — the same shape of thing it
helps others build:

- **`app`** — Next.js (TypeScript): the UI, the `/api/analyze` route (streams progress
  over SSE), and the `/api/history` route
- **`db`** — Postgres: stores past analyses (repo URL, detected stack, generated yaml)
- **`cache`** — Valkey: caches analysis results per `repo@branch` so re-running a demo
  or re-analyzing a repo is instant instead of re-spending Gemini/GitHub API calls

See [`zerops.yaml`](./zerops.yaml) for the deployment config.

## Local development

```bash
cp .env.example .env.local   # fill in GEMINI_API_KEY (free at aistudio.google.com/apikey)
docker compose up -d         # local Postgres + Valkey
npm install
npm run dev
```

## AI tools used

- **Gemini 2.5 Flash (Google AI free tier)** — powers the repository analysis inside the
  product itself
- **Claude Code** — used to build this project
