# n8n Video Agent MVP

This directory is the local MVP base for an n8n-powered video agent workflow.

## Services

- PostgreSQL 17 for n8n internal data and the separate `video_agent` workflow database.
- n8n at <http://localhost:5678>.
- Named Docker volumes for PostgreSQL and n8n state.
- Local `./data` mount for generated workflow files.

## Start

```bash
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Database Credentials

PostgreSQL from the host:

```text
Host: localhost
Port: 5432
User: n8n
Password: n8n_123456
n8n database: n8n
workflow database: video_agent
```

From inside n8n, use `postgres` as the host.

## First Workflow Database

The `video_agent` database contains the first MVP table:

```text
video_topics
```

The intended first loop is:

```text
IDEA -> GENERATING_SCRIPT -> SCRIPT_READY
```

Keep API keys in n8n Credentials or `.env`; do not place them in Markdown or exported workflow JSON.

## First n8n Workflow

An adapted starter workflow is available at:

```text
n8n/workflow/01_postgres_script_workflow.json
```

It calls GLM through the OpenAI-compatible BigModel endpoint and reads `GLM_API_KEY` plus `GLM_MODEL` from `.env`.
Rotate the previously exposed key, then update `.env` and restart n8n:

```bash
docker compose up -d n8n
```

In n8n, create a PostgreSQL credential for the workflow:

```text
Host: postgres
Port: 5432
Database: video_agent
User: n8n
Password: n8n_123456
SSL: Disable
```
