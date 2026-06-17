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
| `SERVICE_API_KEY` | Yes (for WhatsApp integration) | Shared secret for trusted service-to-service callers (e.g. `lexai-whatsapp-bot`), checked by `ServiceAuthGuard` via the `X-Service-Key` header. See [Service-to-Service / WhatsApp Integration](#service-to-service--whatsapp-integration). |

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
| `POST` | `/auth/whatsapp-link` | `X-Service-Key` | **Internal/service-only.** Find or create a user by phone number, returns tokens |
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
- [x] Test coverage + GitHub Actions CI: unit tests for all services/guards/strategies/prompts/filters (112 tests, 59% statement coverage), `.github/workflows/ci.yml` runs on every push/PR (Task 11)
- [x] `GET /documents` — paginated list of the current user's documents (`page`/`limit` query params, newest-first, minimal fields without `extractedText`); usable by both web/mobile and WhatsApp-linked users since they share the same JwtAuthGuard-protected token
- [x] Service-to-service / WhatsApp integration: phone-number user identity (optional email, `phoneNumber`, `authProvider`), `ServiceAuthGuard` + `SERVICE_API_KEY`, `POST /auth/whatsapp-link`, optional-email handling across auth flows — see [Service-to-Service / WhatsApp Integration](#service-to-service--whatsapp-integration) below

### Planned
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

---

## Service-to-Service / WhatsApp Integration

A separate repo, `lexai-whatsapp-bot`, bridges WhatsApp to this backend so users can upload and chat about documents from WhatsApp instead of the web/mobile app. WhatsApp users never "register" in the traditional sense — their first message *is* their registration.

### The two-layer model

Two distinct problems are solved separately, and deliberately not conflated:

1. **Which service is calling** — `ServiceAuthGuard` checks the `X-Service-Key` header against the `SERVICE_API_KEY` env var (constant-time comparison), rejecting with 401 if missing, wrong, or unconfigured. This proves the caller is the trusted `lexai-whatsapp-bot` deployment. It is intentionally a single static shared secret for one trusted internal caller — **not** a scoped, database-backed, per-service API key system, and carries no notion of *which end-user* the request is for. A production deployment serving multiple external services should replace this with one (hashed keys, individual revocation, per-key scopes/audit log).
2. **Which user it's acting for** — `POST /auth/whatsapp-link` (itself behind `ServiceAuthGuard`) takes a `phoneNumber` and finds-or-creates the corresponding `User`, then issues normal access/refresh tokens via the same token-signing logic as `/auth/login`. From that point on, the bot uses that token exactly like any web/mobile client — there is no special "service" mode for `/documents/*` or `/users/*`; `JwtAuthGuard` doesn't know or care that the token came from a phone-link instead of an email/password login.

Both layers are required: layer 1 alone would let the bot call `/auth/whatsapp-link` but say nothing about *whose* documents to touch; layer 2 alone (no `ServiceAuthGuard`) would let anyone mint a token for any phone number with no proof they're the trusted bot.

### Setting up `SERVICE_API_KEY`

1. Generate a long random secret, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set it as `SERVICE_API_KEY` in this server's `.env` (never commit the real value — `.env.example` only has a placeholder).
3. Share the same value with the `lexai-whatsapp-bot` deployment through your secrets manager or deployment platform's env var config — never in a commit, chat log, or shared doc. Rotate it by updating both deployments together; there is no rotation tooling, since this is an MVP single-secret mechanism (see above).

### Full flow

1. A user messages the bot on WhatsApp for the first time.
2. `lexai-whatsapp-bot` calls `POST /auth/whatsapp-link` with header `X-Service-Key: <SERVICE_API_KEY>` and body `{ phoneNumber, displayName? }`.
3. This backend finds or creates the `User` (idempotent — never a duplicate for the same phone number) and returns `{ accessToken, refreshToken, user }`.
4. The bot stores that token (keyed by phone number) and uses it exactly like a web/mobile client would: `Authorization: Bearer <accessToken>` on `POST /documents/upload`, `POST /documents/:id/analyze`, `POST /documents/:id/chat`, `GET /documents`, etc.
5. When the access token expires, the bot calls `POST /auth/refresh` with the stored refresh token, same as any other client.

### Account-merging policy (MVP)

`email` and `phoneNumber` are independent unique columns with no cross-linking. If a WhatsApp user (phone, no email) later registers normally with an email — or a future flow lets a web user attach a phone number already used by a WhatsApp identity — the result today is **two separate `User` rows**, not a merge. `register()` only checks for collisions by email; `whatsappLink()` only checks by phoneNumber; the two code paths structurally cannot collide with each other. This is a deliberate MVP simplification. Detecting and merging the same real-world person's identities (and their associated documents/history) across sign-in methods is a documented future enhancement, not implemented now.
