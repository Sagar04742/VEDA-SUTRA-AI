# VedaSutra – Vedic Math & Ancient Science Assistant

A MERN chatbot where logged-in users ask about Vedic mathematics and ancient science. It solves problems with Vedic techniques step by step, explains sutras and concepts from **your own knowledge base**, and remembers the conversation so follow-ups like *"What are the types of it?"* work.

| | |
| --- | --- |
| **Frontend** | React + Vite, React Router, Tailwind CSS, axios |
| **Backend** | Node.js + Express (ES modules), Mongoose, zod |
| **Database** | MongoDB (Atlas in production) |
| **Chat AI** | Google Gemini (`@google/genai`), streaming + function calling |
| **Title AI** | Mistral (`@mistralai/mistralai`) |
| **Auth** | bcrypt + JWT in an httpOnly cookie |

No model is trained. Answers come from the Vedic solver (exact arithmetic) and retrieval from your data in MongoDB.

---

## What you need to provide

Everything else is built and tested. To go live you only need to fill in `server/.env`:

| Variable | What |
| --- | --- |
| `MONGO_URI` | Your MongoDB / Atlas connection string |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and the exact model ID you want to use |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | Mistral key and model ID (only used for chat titles) |
| `JWT_SECRET` | A long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |

Model names are never hardcoded; they come from the environment.

## Quick start

Requires **Node.js 22+**.

```bash
npm install                      # installs client + server (npm workspaces)
cp .env.example server/.env      # then edit server/.env (see above)
docker compose up -d             # local MongoDB (skip if you use Atlas)
npm run ingest                   # load data/raw into the knowledge base
npm run dev                      # API on :PORT (11111), web app on the CLIENT_URL port (8888)
```

Open http://localhost:8888, sign up, and start chatting.

Then confirm everything works with your real keys:

```bash
npm run check:live
```

This checks the env vars, MongoDB and the knowledge base, then runs real conversations through the whole app: login, streaming, tool calls, the Mistral title, the **memory test** (*"What is Vedic math?"* then *"What are the types of it?"*), the solver (*98 × 97*) and an off-topic question. It deletes its test user afterwards.

### Trying it without API keys (dev only)

Set `AI_MOCK=1` in `server/.env`. A built-in stand-in replaces the Gemini/Mistral SDK clients so you can see streaming, the Stop button, the StepViewer, history and retrieval working. **It is not an AI**: it picks a tool with simple rules and prints what the tool returned (its replies are labelled). Never set it in production.

## Models and free-tier limits

`npm run models -w server` lists the models your keys can really use (a model can be listed yet refused: `gemini-2.5-flash` was listed for the project key but returned 404 "no longer available to new users").

Chosen for a **free** key after measuring tool calling, speed and rate limits on the project key:

| Setting | Value | Why |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Handles streaming + tool calling + images, about 1 s per call, ~15 calls/minute |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.1-flash-lite` | Free quotas are per model, so when the main model is limited the answer restarts on this one (nothing is shown twice) |
| `MISTRAL_MODEL` | `ministral-8b-latest` | Short, good titles (also in Hindi); `mistral-small` was throttled on the free plan |

**Model picker (the three answer levels).** Click the logo in the chat to choose how much detail you want. The choice is remembered in the browser and sent with each message:

| Level | Model setting | Answer style |
| --- | --- | --- |
| **Sutra Lite** (default) | `GEMINI_MODEL` | one or two short paragraphs, about 120 words |
| **Sutra Plus** | `GEMINI_MODEL_PLUS` | clear, balanced, about 300 words with one example |
| **Sutra Pro** | `GEMINI_MODEL_PRO` | thorough: idea, steps, worked example, caveats, related concepts |

A level whose model is not set uses the one below it. If a level's model is busy or at its free limit, the answer comes from the next model down and the user is told (for example "Sutra Pro is busy or at its free usage limit right now, so this answer came from Sutra Plus"). With the project's models, a live test of the same question gave 79 words (Lite), 250 words (Plus) and 541 words (Pro), and Pro really did fall back to Plus when Google returned a 503.

Measured on the free tier: `gemini-3.5-flash` and `gemini-3.8-flash` give better answers but allow only about 6 calls per minute, and one question needs 2–3 calls (a tool call, then the answer), so they run dry almost immediately. If you move to a paid plan, set `GEMINI_MODEL=gemini-3.5-flash` (or newer) for the best quality.

When every model is limited, the user sees a message with a live countdown instead of an error. **Web search** (Google Search grounding) was refused on the free key (quota 0); the app then answers from the knowledge base and says so.

## Features and how they work

**Memory.** On every message the server loads that chat's saved messages from MongoDB, keeps the last `CHAT_HISTORY_LIMIT` (default 20), and sends them to Gemini with the new message. History sent by the browser is ignored. The system prompt is passed separately from the history (Gemini's `systemInstruction`), so trimming a long chat can never drop it. Every chat route checks that the chat belongs to the logged-in user (other users get a 404).

**Streaming.** `POST /api/chats/:id/messages` answers with Server-Sent Events:

| Event | Data |
| --- | --- |
| `start` | `{ userMessageId }` |
| `token` | `{ text }` – a piece of the answer |
| `solver` | `{ tool, method, answer, steps[] }` – a solver result (rendered by `StepViewer`) |
| `title` | `{ title }` – the generated chat title (first message only) |
| `done` | `{ aborted, message }` – the saved assistant message |
| `error` | `{ message }` – the turn is discarded server-side so **Retry** doesn't duplicate it |

"Stop generating" aborts the fetch; the server sees the closed connection, cancels the Gemini request and saves the partial text.

**Titles.** On a chat's first message the server asks Mistral for a ≤5-word title in parallel with the answer and pushes it as `event: title`. If Mistral is missing, slow (8 s) or fails, the title is the first 40 characters of the message. A title problem never affects the answer.

**Solver** (`server/services/solver`). Deterministic functions returning `{ answer, steps[] }`: Nikhilam and Urdhva-Tiryagbhyam multiplication, squaring (numbers ending in 5, numbers near a base), vinculum conversion both ways, digit sum, divisibility by 2–11, and casting-out-nines product checks. They use BigInt and verify every result against ordinary arithmetic before returning. Gemini calls them through function calling instead of doing maths itself; the tool loop works together with streaming and history.

**Knowledge and retrieval.** `npm run ingest` cleans and chunks everything in `data/raw` into the `knowledge` collection. `searchKnowledge()` in `server/services/rag.js` is the single retrieval function (a weighted MongoDB text index in v1), so Atlas Vector Search can replace its body later. It is exposed to Gemini as a tool. The system prompt tells Gemini to turn follow-ups into standalone queries using the history, and the server adds a safety net: if a query finds nothing, it retries with the previous user message appended.

**Languages.** The assistant replies in the language the user writes in (English, Hindi, Marathi, Tamil, Sanskrit terms in Devanagari, mixed styles). The knowledge base is mostly English, so the system prompt makes Gemini write its `searchKnowledge` queries in English and explain the result in the user's language. The app's own buttons and labels are English.

**Voice input.** The microphone button uses the browser's built-in speech recognition (Chrome, Edge, Safari; not Firefox, where the button is hidden). Pick the spoken language next to the input (English, Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi); it is remembered. No API key needed. In Chrome the audio is sent to Google's speech service to be transcribed, and it needs an internet connection and microphone permission.

**Images.** The paperclip attaches up to 3 pictures (JPG, PNG, WEBP) per message, for example a photo of a maths problem, a Sanskrit verse or a diagram. They are shrunk in the browser, checked on the server (size and real file type), stored in their own `images` collection (not inside the chat document) and sent to Gemini. The most recent 4 pictures stay in context for follow-up questions. Only the owner of a chat can load its pictures. Reading handwriting or blurry photos depends on the Gemini model you choose.

**Tools** (toggles above the input):
* **Web search** adds Google Search to Gemini's tools. The knowledge base and solver stay available; web material is labelled "From the web" and its links are shown under the answer. Not every Gemini model allows this combination: if the model refuses, the app tells the user and answers from the knowledge base instead. *This has only been tested against a fake client, so check it with your model.*
* **Deep explain** asks for a longer, more structured explanation with examples and allows more searches.

**Free-tier limits.** When Gemini says the free quota is used up, the user sees a clear message instead of a failure: for a per-minute limit a live countdown ("try again in 0:34") with Retry enabled when it ends; for a daily limit a message to come back later. The app's own rate limiter (`AUTH_RATE_LIMIT`, `CHAT_RATE_LIMIT`) reports a wait time the same way. A failed turn is never saved, so Retry doesn't duplicate anything, and a brand-new chat whose first message fails is discarded rather than left empty.

**One answer at a time.** A chat accepts a new message only after the previous answer finishes (or is stopped), so double-clicks or two tabs cannot interleave answers. History stays strictly in order.

**Honesty rules** (system prompt): answer from tools or say the knowledge base has nothing; cite the source; mention the provenance label (`verified_math` / `traditional_text` / `interpretation`) and never present traditional or interpretive claims as proven; add "educational only, not medical advice" for health topics; politely decline off-topic questions.

## Adding your data

Put files in `data/raw/` and run `npm run ingest` (safe to re-run: each file's entries are replaced). Supported:

* **`.json`** – an array of entries `{ name, sanskrit, meaning, category, whenToUse, steps[], examples[], tags[], source, provenance }`. `name`, `source` and `provenance` are required. `data/raw/core-vedic-math.json` is a worked example.
* **`.csv`** – one entry per row; the first row names the columns (`name` and `meaning` required; optional `sanskrit, category, whenToUse, steps, examples, tags, source, provenance`; separate several steps/examples/tags with `|` or `;`). Easiest format if you are writing data by hand in Excel or Google Sheets.
* **`.pdf`, `.docx`, `.md`, `.txt`** – split into sections by headings and chunked (~1000 characters). PDF extraction artefacts (page footers, LaTeX, citation markers, the bibliography) are cleaned. PDF chunks record their starting page in `source`.

**Dataset formats that are recognised automatically** (see `data/formats.js`): the "AIKS" record PDF (`AIKS-00001 | domain | topic` with Q/A/Source lines), the "starter" dataset PDF (`IAM-001 — …` records) and question-bank CSVs (`id, category, type, difficulty, question, answer, source`). For the AIKS file the 800 arithmetic-practice records are *not* imported (the solver computes those exactly, and thousands of near-identical "Calculate 2 × 3" entries would drown real knowledge); the ~400 history records are merged by topic because they repeat the same answer under many phrasings. In the question bank, the 47 exact calculations are skipped for the same reason, and the myth-busting "Hallucination Trap" rows are kept because they carry sourced corrections. Mark a file `"skip": true` in `sources.json` to leave it out (used for the two duplicates of the question bank).

**About "training".** Nothing is trained, on purpose. A free API can't be fine-tuned, and training on a small dataset would make the bot more likely to invent things. Instead every file you add is converted into labelled knowledge entries and retrieved at question time, so new data is used straight after `npm run ingest`, and the bot can always say where an answer came from. The better and more structured your data (clear names, Sanskrit terms, steps, examples, honest `provenance`), the better the answers.

Files without their own metadata take defaults from **`data/raw/sources.json`** (`source`, `provenance`, `category`, `tags`). **Choose `provenance` deliberately**:

| Label | Use for | How the bot treats it |
| --- | --- | --- |
| `verified_math` | Mathematically checkable facts and methods | States as fact |
| `traditional_text` | What a traditional text says or attributes | "According to…", not proven |
| `interpretation` | Modern/secondary claims, reported findings | Presented as an interpretation |

`Vedic Mathematics Application Datasets.pdf` (the file supplied so far) is a research survey on hardware multipliers and teaching studies, not a tutorial, so it is loaded as `interpretation`/`research`. `core-vedic-math.json` is a curated seed (the 16 sutras and the techniques the solver implements) written for this project. Review it. It deliberately notes that the Vedic origin of the sutras is the author's attribution and is not supported by study of the surviving Vedic texts.

`node data/ingest.js --dry` (from the repo root) writes cleaned chunks to `data/processed/` without touching the database, handy for checking how a new file was split.

There is no ancient-science content yet beyond what the PDF touches. Until you add it, the bot will say the knowledge base has nothing on such topics rather than guess.

## Checking answer quality

`npm run eval` asks the question bank (`data/raw/questions_extended.csv`) through the real app, one fresh chat per question, and writes `data/processed/eval-report.md` for you to read. Options: `-- --category traps|sutras|science|calc`, `-- --limit 10`, `-- --calc` (also the 47 exact calculations). Scoring is a keyword check, not a judge model, so read the REVIEW rows yourself. The knowledge-type answers from that file were also loaded into the knowledge base, so a good score shows the pipeline works, not that the bot generalises: for a fair test keep some questions out of `data/raw`.

The 47 exact calculations are also a **unit test** (`server/tests/solver-more.test.js`): the solver must answer every one correctly using the technique the question names.

## Tests

```bash
npm test
```

Server tests (Vitest, 190+ tests): auth; solver with seeded random inputs and edge cases; chat routes (ownership, DB-built history, history limit, SSE, abort with partial save, mid-stream errors); the Gemini tool loop with a scripted fake client; Mistral titles and fallbacks; ingestion cleaning; retrieval; and an end-to-end memory flow. They run against an in-memory MongoDB started once. **The first ever run downloads a mongod binary (~800 MB, a few minutes).** To use your own MongoDB, set `TEST_MONGO_URI=mongodb://127.0.0.1:27017/`.

The unit tests use fake model clients, so they prove the plumbing, not the quality of Gemini's answers. That's what `npm run check:live` is for.

## Deploying

The simplest setup is **one web service** that serves both the API and the built React app, so cookies are same-origin and there is no CORS or cross-site cookie trouble.

1. **MongoDB Atlas**: create a cluster and a database user, allow your host's IPs under *Network Access*, and copy the connection string.
2. **Load the data**: from your machine, with `MONGO_URI` in `server/.env` pointing at Atlas, run `npm run ingest`.
3. **Render** (or any Node host): create a *Web Service* from this repo.
   * Build command: `npm install && npm run build`
   * Start command: `npm run start -w server`
   * Environment: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `CHAT_HISTORY_LIMIT`, and `CLIENT_URL=https://your-app.onrender.com` (the service's own URL).
4. Open the URL, sign up and chat. Check `GET /api/health` (`{"ok":true,"ai":"ready"}`).

In production the cookie is `httpOnly` + `Secure`, error responses never include stack traces, and the server refuses to start with a placeholder `JWT_SECRET`.

**Hosting the client separately** (e.g. Vercel) also works but is more fragile: build the client with `VITE_API_URL=https://your-api`, set `CLIENT_URL` to the client's URL, and set `COOKIE_SAMESITE=none`. Browsers that block third-party cookies will break login in that setup, which is why the single-service route is recommended.

## Project layout

```
vedic-chatbot/
├── client/src/{pages,components,api,context,hooks}   React app (Chat, Login, Signup, StepViewer…)
├── server/
│   ├── routes/ (auth, chats)  middleware/  models/ (User, Chat, Knowledge)  config/  utils/
│   ├── services/{solver/, gemini.js, mistral.js, rag.js, tools.js, prompt.js, ai.js, mockAi.js}
│   ├── scripts/check-live.js
│   └── tests/
├── data/{raw, processed, ingest.js}
├── .env.example
└── README.md
```

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` | `{ name, email, password }` – logs you in |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | clears the cookie |
| GET | `/api/auth/me` | current user |

There is deliberately no email verification, password reset or OAuth; they can be added as new routes beside `server/routes/auth.js`.

Chat API (all require login): `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/:id`, `POST /api/chats/:id/messages` (SSE).

## Troubleshooting

* **"Gemini is not configured…"** in the chat: set `GEMINI_API_KEY` and `GEMINI_MODEL` in `server/.env` and restart.
* **"The AI model was not found"**: `GEMINI_MODEL` isn't a valid model ID for your key.
* **Chats answer "knowledge base has nothing"**: run `npm run ingest`.
* **Can't connect to MongoDB**: start Docker (`docker compose up -d`) or check your Atlas URI and IP allow-list.
* **`querySrv ECONNREFUSED` with an Atlas (`mongodb+srv://`) URL**: your computer hands Node a local DNS server (often a VPN, Docker or WSL adapter) that refuses SRV lookups. The app now retries automatically with public DNS (1.1.1.1 / 8.8.8.8) and prints a one-line notice. To choose resolvers yourself set `DNS_SERVERS=1.1.1.1,8.8.8.8` in `server/.env`.
* **Rate limited**: adjust `AUTH_RATE_LIMIT` / `CHAT_RATE_LIMIT` (see `.env.example`).
