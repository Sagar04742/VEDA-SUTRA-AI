# Vedic Math & Ancient Science Assistant

A MERN chatbot for Vedic mathematics and ancient science. (Built phase by phase; this README grows with each phase.)

**Status:** Phase 1 – setup + auth.

## Requirements
- Node.js 20+ (developed on 24)
- MongoDB: local via Docker (`docker compose up -d`) or a MongoDB Atlas URI

## Setup
```bash
npm install                      # installs client + server (npm workspaces)
cp .env.example server/.env      # then edit server/.env (set JWT_SECRET at least)
docker compose up -d             # local MongoDB (skip if using Atlas)
```

## Run
```bash
npm run dev      # API on :5000, client on :5173 (Vite proxies /api to the API)
```

## Test
```bash
npm test         # server tests (Vitest + in-memory MongoDB; first run downloads a mongod binary)
```

## Auth API
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ name, email, password }` – logs you in |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | clears the cookie |
| GET | `/api/auth/me` | current user (requires cookie) |

The session is a JWT in an httpOnly cookie. There is deliberately no email verification, password reset, or OAuth; add them as new routes next to `server/routes/auth.js`.
