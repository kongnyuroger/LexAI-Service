# LexAI — Backend API

AI-powered personal legal assistant backend. Users upload legal documents (PDF, images, Word) and receive plain-language summaries, risk-flagged clauses, and can chat with their documents. Built for the Cameroonian legal context with a RAG knowledge base.

This repository is a clean REST API consumed by the separate web and mobile frontends.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | NestJS (TypeScript) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma |
| Auth | JWT (access + refresh tokens), bcrypt |
| File Storage | Local filesystem (dev) — swappable for S3/R2 |
| Text Extraction | pdf-parse, tesseract.js (OCR), mammoth |
| AI | OpenAI API (`gpt-4`, `text-embedding-3-small`) |
| Docs | Swagger / OpenAPI at `/api/docs` |
| Tests | Jest (unit) + Supertest (e2e) |

---

## Prerequisites

- Node.js 20 LTS
- npm 9+
- Docker & Docker Compose (for local PostgreSQL)

---

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd lexAI-server
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all values. See the [Environment Variables](#environment-variables) table below.

### 3. Start PostgreSQL (with pgvector)

```bash
docker compose up -d
```

This starts a `pgvector/pgvector:pg16` container on **port `5433`** (mapped to avoid conflicts with a local PostgreSQL on the default 5432) with persistent volume `lexai_pgdata`.

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. (Optional) Seed the database

```bash
npx prisma db seed
```

Creates a test user: `test@lexai.cm` / `password123`

### 6. Start the development server

```bash
npm run start:dev
```

Server starts on `http://localhost:3000` (or `$PORT`).

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port (default: `3000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Yes | Secret for signing refresh tokens |
| `OPENAI_API_KEY` | Yes | API key from platform.openai.com |
| `STORAGE_PATH` | Yes | Local directory for uploaded files (e.g. `./uploads`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (e.g. `http://localhost:3001`) |

---

## Running Tests

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# End-to-end tests
npm run test:e2e
```

---

## API Overview

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/auth/register` | None | Register a new user |
| `POST` | `/auth/login` | None | Login, returns tokens |
| `POST` | `/auth/refresh` | Refresh token | Get new access token |
| `GET` | `/auth/me` | Bearer | Current user profile |
| `GET` | `/users/me/usage` | Bearer | Monthly usage stats |
| `POST` | `/documents/upload` | Bearer | Upload a document |
| `GET` | `/documents/:id` | Bearer | Get document status |
| `POST` | `/documents/:id/analyze` | Bearer | Run AI analysis |
| `GET` | `/documents/:id/analysis` | Bearer | Get saved analysis |
| `POST` | `/documents/:id/chat` | Bearer | Ask a question |
| `GET` | `/documents/:id/chat` | Bearer | Get chat history |
| `POST` | `/knowledge-base/sources` | Admin | Ingest a legal text |

Full interactive docs: **`http://localhost:3000/api/docs`** (Swagger UI, added in Task 10)

---

## Project Status / Roadmap

### Implemented
- [x] Project scaffolding, Docker, health endpoint (Task 1)
- [x] Prisma schema (User, Document, Analysis, RiskFlag, ChatMessage, LegalSource + pgvector), migrations, seed (Task 2)
- [x] JWT authentication — register, login, refresh, GET /auth/me; JwtAuthGuard + CurrentUser decorator (Task 3)
- [x] User module — GET /users/me/usage (plan limits: FREE=3/month, PREMIUM=unlimited) + UsageLimitGuard (Task 4)
- [x] File storage module (abstract StorageService → LocalStorageService) + POST /documents/upload + GET /documents/:id (Task 5)
- [x] Text extraction pipeline: pdf-parse for text PDFs, pdftoppm+tesseract.js OCR fallback for scanned PDFs, tesseract.js for images, mammoth for DOCX; status → TEXT_EXTRACTED (Task 6)
- [x] AI analysis engine: OpenAI GPT-4 summarization + risk flag detection, JSON parsing with code-fence stripping, Analysis + RiskFlag persistence, POST /documents/:id/analyze (with UsageLimitGuard) + GET /documents/:id/analysis (Task 7)
- [x] Document chat module: GPT-4 Q&A grounded in document text, conversation history (last 10 messages), POST /documents/:id/chat + GET /documents/:id/chat (Task 8)
- [x] Legal knowledge base & RAG: text-embedding-3-small (1536-dim), paragraph-chunking with 50-word overlap, pgvector cosine search, context injected into analysis and chat prompts, POST /knowledge-base/sources (Task 9)
- [x] Security hardening & API docs: Helmet, CORS (CORS_ORIGINS env var), ThrottlerModule (100 req/60s global), global AllExceptionsFilter (consistent JSON errors with timestamp + path), Swagger UI at /api/docs with bearer auth, ApiProperty on all DTOs (Task 10)

### Planned
- [ ] Full test coverage + GitHub Actions CI (Task 11)
- [ ] Document chat module — contextual Q&A (Task 8)
- [ ] Legal knowledge base with pgvector RAG (Task 9)
- [ ] API docs, error handling, security hardening (Task 10)
- [ ] Full test coverage + GitHub Actions CI (Task 11)
- [ ] Multilingual support (French/English)
- [ ] Document generator (fill-in-the-blank legal templates)
- [ ] Web frontend (separate repo)
- [ ] Mobile app (separate repo)
- [ ] API docs, error handling, security hardening (Task 10)
- [ ] Full test coverage + GitHub Actions CI (Task 11)
- [ ] Multilingual support (French/English)
- [ ] Document generator (fill-in-the-blank legal templates)
- [ ] Web frontend (separate repo)
- [ ] Mobile app (separate repo)

---

## Adding Legal Source Documents (RAG Knowledge Base)

> **TODO (Task 9):** The knowledge base is seeded with placeholder fixtures only.
> To add real legal texts (e.g. Cameroonian Labour Code, rental law):
> 1. Obtain the official text in plain text or PDF form.
> 2. POST it to `POST /knowledge-base/sources` with `{ title, jurisdiction, sourceType, content }`.
> 3. The system will chunk it, embed it, and store vectors in pgvector automatically.
>
> Do **not** auto-fetch copyrighted texts. Always verify you have the right to use and store the source material.
