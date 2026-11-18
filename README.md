# VedaSutra – Vedic Math & Ancient Science Assistant

A MERN chatbot where logged-in users ask about Vedic mathematics and ancient science. It solves problems with Vedic techniques step by step, explains sutras and concepts from **your own knowledge base**, and remembers the conversation so follow-ups like *"What are the types of it?"* work.

| | |
| --- | --- |
| **Frontend** | React + Vite, React Router, Tailwind CSS, axios |
| **Backend** | Node.js + Express (ES modules), Mongoose, zod |
| **Database** | MongoDB (Atlas in production) |
| **Chat AI** | Five providers behind one chain: Google Gemini, Groq, Mistral, OpenAI (all with streaming + function calling) and Cohere (chat titles) |
| **Answer checker** | **Pramana**, a deterministic verification engine (no AI): the exact Vedic solver + the sourced knowledge base |
| **Auth** | bcrypt + JWT in an httpOnly cookie |

No model is trained. Answers come from the Vedic solver (exact arithmetic) and retrieval from your data in MongoDB.

**Two ideas make VedaSutra different:**

* **Shastrarth (शास्त्रार्थ), the battle of models.** Turn it on, pick any two contestants (the three levels, or a single model from any provider) and both answer your question side by side. Then **Pramana** judges them.
* **Pramana (प्रमाण), a checker that is not an AI.** Every answer is scored out of 10 by plain, repeatable rules against the project's own ground truth: the exact solver (arithmetic proven by code) and the sourced knowledge base with its provenance labels. The same answer always gets the same score, and every point can be explained. See [Pramana](#pramana-the-answer-checker) below.

---

## What you need to provide

Everything else is built and tested. To go live you only need to fill in `server/.env`:

| Variable | What |
| --- | --- |
| `MONGO_URI` | Your MongoDB / Atlas connection string |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini key and the exact model ID you want to use |
| `MISTRAL_API_KEY`, `MISTRAL_MODEL` | Mistral key and model ID (the **Sutra Lite** level) |
| `GROQ_API_KEY`, optional `GROQ_MODELS` | Groq key; the Groq models Plus and Pro try (default `qwen/qwen3.8-27b,openai/gpt-oss-120b`) |
| `OPENAI_API_KEY` (or `OPEN_AI_API_KEY`), optional `OPENAI_MODELS` | OpenAI key (a doubled `sk-sk-` prefix is repaired automatically); default model `gpt-4.1-mini` |
| `COHERE_API_KEY`, optional `COHERE_MODEL` | Cohere key; **writes the chat titles** (default `command-a-03-2025`) |
| optional `TIER_LITE`, `TIER_PLUS`, `TIER_PRO`, `ARENA_MODELS` | Choose each level's models yourself as `provider:model,provider:model`; add extra Shastrarth contestants |
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

This checks the env vars, asks every provider whether its key is accepted (a rejected key is a warning; the app falls back to the others), checks MongoDB and the knowledge base, then runs real conversations through the whole app: login, streaming, tool calls, the Cohere title, the **memory test** (*"What is Vedic math?"* then *"What are the types of it?"*), the solver (*98 × 97*) and an off-topic question. It deletes its test user afterwards.

### Trying it without API keys (dev only)

Set `AI_MOCK=1` in `server/.env`. A built-in stand-in replaces the Gemini/Mistral SDK clients so you can see streaming, the Stop button, the StepViewer, history and retrieval working. **It is not an AI**: it picks a tool with simple rules and prints what the tool returned (its replies are labelled). Never set it in production.

## Pages

| Address | What it is |
| --- | --- |
| `/` | The home page: what VedaSutra is, how it is built, what it can do, and a **Start** button. Public. The library numbers on it are read live from the database. |
| `/login`, `/signup` | Shown only when a visitor needs an account. After logging in you go back to where you were heading (for example straight to `/chat`). |
| `/chat`, `/chat/c/:id` | The assistant. The sidebar can be closed with its arrow and reopened with the menu button (remembered). |
| `/shastrarth`, `/shastrarth/c/:id` | **The Shastrarth arena**: its own page with its own look (see below). Featured in the chat sidebar; the *Shastrarth* button above the message box opens it and takes your question along. A session is saved as a chat, so it can be reopened. |
| `/profile` | Click your name in the sidebar. Level and progress, the **Shastrarth leaderboard** (Elo ratings of the models, from your battles), questions, conversations, calculations, learning streak, a 14-day activity chart, what you explore (Vedic maths, ancient science, calculations), techniques used, languages, badges and recent questions. It is computed from your own saved chats only (`GET /api/profile/stats`); nothing extra is stored. |

While a page restores your session a branded loader is shown; before any JavaScript has loaded, a small loader built into `index.html` is shown instead of a blank screen.

The **Vedic Maths** and **Ancient Science** buttons put a different starter question in the box each time (16 each, shuffled like a deck so nothing repeats until all have been shown; the lists are in `client/src/utils/prompts.js`).

## Models, levels and free-tier limits

`npm run check:models -w server` checks **every model the app can use**: it asks each provider whether the key is accepted and the model exists (free, no generation quota), and with `-- --live` also sends each model a one-word message and times it. The running server does the same check at start-up and every ten minutes: a model the provider refuses (a rejected key, a model name that does not exist) is skipped in every level and shown as *unavailable* in the arena, instead of failing in front of you. Temporary trouble (a busy provider, a broken reply) is not held against a model: the answer simply moves to the next one. `npm run models -w server` lists the models your Gemini key can really use. `npm run bakeoff -w server -- groq:openai/gpt-oss-120b mistral:ministral-14b-latest ...` asks the same 12 questions to each candidate and scores every answer with Pramana, so you can choose models by evidence (`--style`, `--pause`, `--out file.json` are available).

**The three levels** (click the lotus logo in the message box). Each level is an ordered list of models on different providers; the answer comes from the first one that is available:

| Level | Default models | Answer style |
| --- | --- | --- |
| **Sutra Lite** (default) | Mistral `MISTRAL_MODEL`, then Gemini `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | one or two short paragraphs, about 120 words |
| **Sutra Plus** | Gemini `GEMINI_MODEL_PLUS`, OpenAI (if its key works), Gemini `GEMINI_MODEL` (flash-lite), then Groq `GROQ_MODELS` | clear, balanced, about 300 words with one example |
| **Sutra Pro** | Gemini `GEMINI_MODEL_PRO`, `GEMINI_MODEL_PLUS`, OpenAI (if its key works), Gemini flash-lite, then Groq `GROQ_MODELS` | thorough: idea, steps, worked example, caveats, related concepts |

Each level falls back to the levels below it, and the notice names the level you chose and the one that really answered. Measured on free keys with Pramana (12 questions): the Gemini flash-lite models and `gemini-3.8-flash` scored best (9 to 10), Groq's `qwen3.8-27b` about 8.7, Mistral's `ministral-14b` about 8, `gpt-oss-120b` about 7.5. That is why Plus and Pro try Gemini first, then Groq.

**Measured model quality** (`npm run bakeoff`, 10 questions scored by Pramana, free keys): Gemini 3.1 flash-lite **9.5** (15 s per answer), Gemini 3.5 flash-lite **9.5** (3 s), Groq qwen3.8-27b **9.0** (fast, but it hits the 8,000 tokens a minute cap and failed 6 of 10), Mistral ministral-14b **8.0**, Groq gpt-oss-120b **7.5**, Gemini 3.5 flash failed every call (daily limit and overload). That is why Plus and Pro fall back to Gemini flash-lite before Groq, and why Plus really is better than Lite.

**Free-tier facts that shape this** (all measured on the project's keys):

* `gemini-3.8-flash` and `gemini-3.5-flash` allow **20 requests a day** on a free key. A **circuit breaker** remembers a model that says "try again in 2 hours" and skips it until then, so one question does not waste a call (and a second of delay) on a model that is out of quota.
* Groq's free plan allows about **8,000 tokens a minute** per model: roughly one question a minute per model. Its answer length is capped by the style so the request stays small.
* Mistral's small models allow about one request a second.
* A key the provider rejects (401/403) is rested for an hour and the next provider answers.

**Smaller models obey rules less reliably, so the app does not leave it to them.** The first model turn is *forced* to use the right tool (the exact solver for a calculation, the knowledge base for any other question), and with **Web search** on the second turn is forced to search Wikipedia. The length limit is repeated beside the question, with a hard token ceiling as a backstop, so Sutra Lite really is shorter than Sutra Plus. A stream that stops without finishing is an error, not a short answer.

When every model is limited, the user sees a message with a live countdown instead of an error. **Web search** works on any plan: Google Search grounding is not in the free Gemini tier, so the app uses its own tool over **Wikipedia** (English and Hindi, free, no key). **Deep explain** always gives the thorough answer length, whichever level is chosen.

**From our library, loudly.** When an answer is drawn from the knowledge library (our own processed data), it says so unmistakably: a **"Grounded in VedaSutra's library"** badge and a big green **"From VedaSutra's knowledge library"** card listing the exact entries used, each with its provenance label (verified maths, traditional text, interpretation) and its source. A search that found nothing shows an amber **"Not found in our library"** card, web material gets its own teal **"From the web (Wikipedia)"** card with the page links, and the exact solver has its own gold card. In a battle, a contestant that answered without looking anything up is marked **"Answered from the model's memory, not from our library"**.

**Show your work.** While an answer is written, a small log shows what is happening, live: *Searching the knowledge base for "…" → Found 2 entries: …*, *Searching Wikipedia for "…" → Read 3 Wikipedia pages: …*, *Multiplying 98 × 97 with the exact Vedic solver*. It is saved with the message, and the pages used are linked under the answer. SSE event: `activity`.

## Readiness check: is this model usable *right now*?

Free models fail in many ways: a refused key, a daily limit, an overloaded server, a broken reply. So nothing is trusted blindly:

* **Health check** (start-up and every 10 minutes, free): is the key accepted and does the model exist?
* **Readiness check** (a tiny real request, a few tokens): can the model answer properly *right now*? It runs when you choose a contestant in the arena (each plaque shows *Security check…* then **Ready · replied in 0.9s**, or **Not ready: it has used its free daily limit** with *Check again*) and again when you press *Begin the debate*. The start button stays locked until both contestants pass, and the server refuses (409) a debate with a contestant that is not ready, so a failure is found in a second instead of halfway through. A level is ready if *any* model in its chain is, and the badge says which one will answer. Results are remembered (3 minutes for a pass, 40 seconds for a failure), so asking again is instant; a failed check also rests the model so ordinary chats skip it meanwhile. API: `POST /api/models/ready` `{ ids: [a, b], fresh? }`.

## Shastrarth: the battle of models

Shastrarth has **its own page**, built around two pieces of artwork (a gold scholar on the left, a sapphire one on the right; `client/public/arena-dark.jpg` and `arena-light.jpg`, with phone crops `-m` and sidebar thumbnails `-thumb`). In the chat it is **featured in the left sidebar** and in the tools row above the message box; either one opens the arena.

* **Setup.** Pick the two contestants with the rich pickers (a status light shows whether each is ready, busy at its free limit, or refused by its provider; unavailable ones cannot be chosen), pose the question on the ceremonial "scroll" (or tap an idea), optionally switch on Web search or Deep explain, and **Begin the debate**.
* **The debate.** Both answer at once, in two columns (stacked on a phone), each with a live stopwatch, its own live work log (the searches really visible) and word count. A single model gets no fallback: if it fails, you see that, not a quiet substitute.
* **Rounds.** Ask again and it becomes round 2, 3...; the **match scoreboard** keeps wins and total Pramana points per contestant, **Rematch with sides swapped** replays the same question with the contestants in opposite corners, and earlier rounds fold away underneath. Every session is saved as a chat, reopens after a reload, and feeds the **Hall of Champions** (Elo ratings of the models) shown beside the arena and in full on your profile.
* Dark and light themes each have their own artwork; embers rise on both sides during a debate.

Contestants are the three levels or any single model from any provider that has a key. A side that fails or is rate-limited is shown as such and is not scored.

When both are finished, Pramana judges them:

* a **score ring** for each (score out of 10 and as a percentage), a **seal** (Verified, Sound, Shaky, Unreliable) and a **hallucination risk** rating with the reasons;
* a **radar chart** of the two on Accuracy, Grounding, Honesty and Clarity;
* the **winner** and margin (scores within half a point are an honourable draw);
* **Claim X-ray**: the answer cut into sentences, each marked *verified*, *matches the knowledge base*, *general*, *contradicts the knowledge base*, *not in the knowledge base*, *overclaims* or *wrong*, with the reason;
* **Why these scores?**: every check that earned or lost points, and what the answer was checked against; a *Copy verdict* button.

The winner's text becomes the chat's memory (follow-ups continue from it). Everything is saved on the message and reopens after a reload. Your results feed the **Hall of Champions** and the **Shastrarth leaderboard** on the profile page: an Elo rating per model (what each level really answered with is what counts), with record, average score, speed and share of risky answers. API: `battle: { a, b }` in the message body (a level id such as `pro`, or `provider:model`), side-tagged `token` / `solver` / `notice` / `activity` events, then `side_done` / `side_error` and `verdict`; `GET /api/models` lists the `arena`; `GET /api/profile/arena` is the leaderboard.

## Pramana: the answer checker

Pramana (`server/services/verifier.js`, `claims.js`) is the project's main safeguard. **No AI is used to judge.** It works from the project's own data and fixed rules, so the same answer always gets the same score and every point has a reason.

**Ground truth, built once per question** (and remembered for ten minutes, so a rematch is instant): a calculation is solved by the exact Vedic solver; any other question is looked up in the knowledge base, with a relevance grade (strong, weak) and word-family matching ("veda" finds "Vedic"). A question in Hindi (or another script) is matched through a small project glossary (`glossary.js`).

**Also checked:** the **web pages the model really read** count as evidence for the sentences that rely on them (marked *Matches Wikipedia*), and an answer that **contradicts itself** (two sentences about the same thing giving different figures) is flagged.

**Checks that go beyond word matching:** word families (an answer saying "built" or "withstood" matches an entry saying "erected" or "resisted"); **negation that applies to the right words** ("did *not* resist corrosion" against "resisted corrosion" is a contradiction, while "an interpretation, *not* settled fact" is a hedge); the **provenance label** an answer puts on its source must be the entry's own (calling an interpretation "verified maths" overstates it); and entries named after the question are ranked first when judging.

**Scoring, out of 10:**

| Part | Points | What it checks |
| --- | --- | --- |
| Accuracy | 4 | The result equals the solver's; the answer covers the entry's key facts; no sum written in it is wrong (**every "a × b = c" is verified exactly**); no figure contradicts the knowledge base; no invented dates (a hedged "around 400 CE" costs far less than a flat claim, and a "4th century" entry allows 301 to 400) |
| Grounding | 3 | Used the exact solver or searched the knowledge base; cited the entry's source; a **cited source that exists nowhere in the knowledge base is flagged as invented** |
| Honesty | 2 | Traditional claims are attributed ("according to…"), interpretations are hedged, no overclaiming ("proven", "miracle", "lost advanced technology"; a caution *against* such claims is not an overclaim), the health note on medical topics, says so when the knowledge base has nothing |
| Clarity | 1 | Replies in the question's language and script, plain text (no LaTeX), a complete ending, within the length its level promises |

Questions with nothing to look up are judged on the rules alone (an off-topic question must be politely declined; a greeting must be friendly). For a Hindi question the wording cannot be compared with the English knowledge base, so figures, dates, sums and sources are compared and the facts get a neutral 2.5 of 4; each verdict states its **confidence** (exact, high, medium, limited, rules only).

**How good is it?** `npm run calibrate -w server` builds a careful answer from every knowledge-base entry, then makes copies with one flaw each (no source, invented source, invented date, changed figure, overclaiming, a tradition stated as fact, missing health note, no facts, off the subject) plus 300 random multiplications with right and wrong products, and checks that the careful answer always scores higher by a safe margin. On the project's 151 entries: **98.9% correct rankings** (2,055 of 2,078), calculations 100%, the entry is found as evidence for its own question **151 of 151** times, careful answers average **9.99/10**, and **the same answer written in other words keeps its score in 148 of 148 cases** (a checker that only likes exact copies would be useless). A verdict takes about 5 to 20 ms. The same checks run in the unit tests without a database, plus **property tests** (damage never raises a score; reordering sentences or adding friendly chatter does not change the facts score), hostile-input tests (100,000-character answers, endless spaces and equals signs finish in well under a second) and a 300-case random-mixture test that keeps every score inside 0 to 10.

## Look and feel

* **Your photos as the background.** `client/public/bg.jpg` (temple at dusk) is the dark theme's backdrop and `client/public/bg-light.jpg` (temple at dawn) the light theme's, with slowly drifting light (and stars in the dark theme). Replace a file to change it.
* **Dark and light mode.** The sun/moon button (top right on every page) switches; the choice is remembered and applied before the page paints. Dark is the default. Every colour is a variable in `client/src/index.css`, so a theme is just one set of values.
* **Loader.** On a fresh page load a branded loader (turning gold rings round a glowing lotus, rotating phrases) stays for at least about two seconds (`MIN_BOOT_MS` in `context/AuthContext.jsx`) and then fades out.
* Wider layout (up to 1024px of conversation), glass-style panels, and gentle motion everywhere; all of it switches off for people who ask their device to reduce motion.

## Features and how they work

**Memory.** On every message the server loads that chat's saved messages from MongoDB, keeps the last `CHAT_HISTORY_LIMIT` (default 20), and sends them to Gemini with the new message. History sent by the browser is ignored. The system prompt is passed separately from the history (Gemini's `systemInstruction`), so trimming a long chat can never drop it. Every chat route checks that the chat belongs to the logged-in user (other users get a 404).

**Streaming.** `POST /api/chats/:id/messages` answers with Server-Sent Events:

| Event | Data |
| --- | --- |
| `start` | `{ userMessageId }` |
| `token` | `{ text }` – a piece of the answer |
| `solver` | `{ tool, method, answer, steps[] }` – a solver result (rendered by `StepViewer`) |
| `activity` | `{ id, phase: 'start' \| 'done', tool, kind, text, result?, count? }` – what the assistant is doing (the live work log) |
| `title` | `{ title }` – the generated chat title (first message only) |
| `done` | `{ aborted, message }` – the saved assistant message |
| `error` | `{ message }` – the turn is discarded server-side so **Retry** doesn't duplicate it |

"Stop generating" aborts the fetch; the server sees the closed connection, cancels the Gemini request and saves the partial text.

**Titles.** On a chat's first message the server asks **Cohere** for a ≤5-word title in parallel with the answer and pushes it as `event: title`. If Cohere is missing, slow (8 s) or fails, the title is the first 40 characters of the message. A title problem never affects the answer.

**Solver** (`server/services/solver`). Deterministic functions returning `{ answer, steps[] }`: Nikhilam and Urdhva-Tiryagbhyam multiplication, squaring (numbers ending in 5, numbers near a base), vinculum conversion both ways, digit sum, divisibility by 2–11, and casting-out-nines product checks. They use BigInt and verify every result against ordinary arithmetic before returning. Gemini calls them through function calling instead of doing maths itself; the tool loop works together with streaming and history.

**Knowledge and retrieval.** `npm run ingest` cleans and chunks everything in `data/raw` into the `knowledge` collection. `searchKnowledge()` in `server/services/rag.js` is the single retrieval function (a weighted MongoDB text index in v1), so Atlas Vector Search can replace its body later. It is exposed to Gemini as a tool. The system prompt tells Gemini to turn follow-ups into standalone queries using the history, and the server adds a safety net: if a query finds nothing, it retries with the previous user message appended.

**Languages.** The assistant replies in the language the user writes in (English, Hindi, Marathi, Tamil, Sanskrit terms in Devanagari, mixed styles). The knowledge base is mostly English, so the system prompt makes Gemini write its `searchKnowledge` queries in English and explain the result in the user's language. The app's own buttons and labels are English.

**Voice input.** The microphone button uses the browser's built-in speech recognition (Chrome, Edge, Safari; not Firefox, where the button is hidden). Pick the spoken language with the small chip (for example **EN**) right beside the microphone (English, Hindi, Marathi, Bengali, Tamil, Telugu, Gujarati, Kannada, Malayalam, Punjabi); it is remembered. No API key needed. In Chrome the audio is sent to Google's speech service to be transcribed, and it needs an internet connection and microphone permission.

**Images.** The paperclip attaches up to 3 pictures (JPG, PNG, WEBP) per message, for example a photo of a maths problem, a Sanskrit verse or a diagram. They are shrunk in the browser, checked on the server (size and real file type), stored in their own `images` collection (not inside the chat document) and sent to Gemini. The most recent 4 pictures stay in context for follow-up questions. Only the owner of a chat can load its pictures. Reading handwriting or blurry photos depends on the Gemini model you choose.

**Tools** (toggles above the input):
* **Web search** makes the assistant search the web on top of the knowledge base (Google Search when your Gemini plan has it, otherwise Wikipedia). It is not optional for the model: with the toggle on, the second turn is forced to search, and you see the search happen live in the work log. Web material is labelled "From the web" and its links are shown under the answer. Tested live: it searched the knowledge base, then read three Wikipedia pages, and linked them.
* **Deep explain** asks for a longer, more structured explanation with examples and allows more searches.

**Free-tier limits.** When Gemini says the free quota is used up, the user sees a clear message instead of a failure: for a per-minute limit a live countdown ("try again in 0:34") with Retry enabled when it ends; for a daily limit a message to come back later. The app's own rate limiter (`AUTH_RATE_LIMIT`, `CHAT_RATE_LIMIT`) reports a wait time the same way. A failed turn is never saved, so Retry doesn't duplicate anything, and a brand-new chat whose first message fails is discarded rather than left empty.

**One answer at a time.** A chat accepts a new message only after the previous answer finishes (or is stopped), so double-clicks or two tabs cannot interleave answers. History stays strictly in order.

**Honesty rules** (system prompt): answer from tools or say the knowledge base has nothing; cite the source; mention the provenance label (`verified_math` / `traditional_text` / `interpretation`) and never present traditional or interpretive claims as proven; add "educational only, not medical advice" for health topics; politely decline off-topic questions.

## Adding your data

Put files in `data/raw/` and run `npm run ingest` (safe to re-run: each file's entries are replaced). Supported:

* **`.json`** – an array of entries `{ name, sanskrit, meaning, category, whenToUse, steps[], examples[], tags[], source, provenance }`. `name`, `source` and `provenance` are required. `data/raw/core-vedic-math.json` is a worked example.
* **`.csv`** – one entry per row; the first row names the columns (`name` and `meaning` required; optional `sanskrit, category, whenToUse, steps, examples, tags, source, provenance`; separate several steps/examples/tags with `|` or `;`). Easiest format if you are writing data by hand in Excel or Google Sheets.
* **`.pdf`, `.docx`, `.md`, `.txt`** – split into sections by headings and chunked (~1000 characters). PDF extraction artefacts (page footers, LaTeX, citation markers, the bibliography) are cleaned. PDF chunks record their starting page in `source`.

### Adding a whole book (`"layout": "book"`)

Short datasets become one entry per record. A **whole book** (hundreds of pages) is handled by `data/books.js`: drop the PDF in `data/raw/`, add a block for it in `data/raw/sources.json`, run `npm run ingest`.

```json
"My-Book.pdf": {
  "layout": "book",
  "ocr": true,
  "source": "Author, Title (Publisher, year)",
  "provenance": "interpretation",
  "category": "indian-mathematics",
  "shortTitle": "Title (Author)",
  "skipPages": [1, 2],
  "chapters": ["First chapter title", "Second chapter title"],
  "chapterPages": [1, 13]
}
```

Only `layout`, `source`, `provenance` and `category` are needed. `ocr: true` is for a scan (see below), `skipPages` for pages that are covers, contents or two columns that extraction interleaved, and `chapters` (the titles from the contents page) with `chapterPages` (the page each one starts on) lets a scanned book be labelled by chapter.

What the pipeline does, with no AI (the same book always gives the same entries):

1. **Cleans each page**: margin numbers and stray letters after a tab, page numbers, links, rows of table debris ("1 2 3 4 5…"), hyphenated line breaks ("mathe-" + "matics").
2. **Repairs a scan (`ocr: true`)**: a rare word one or two letters away from a common word of the same book is a misread ("thc" becomes "the"); the many scanned spellings of "Sutra" (Siitra, Sfitra, SBtra…) are corrected; a mangled capitalised Sanskrit name is corrected to the real one ("Nikhilap" becomes "Nikhilam") using a list of the sutra names and classical authors.
3. **Finds the real structure**: headings, numbered sections ("1.5 Development of Glass in India"), and for a book with a `chapters` list every chapter by number and by title similarity, accepting only a chapter at or just after the current one. A chapter whose heading is unreadable is **placed from the contents page** (its printed start page, between the chapters that were found). On the Tirthaji scan all **40 of 40** chapters are found, in order. Every chunk is named for where it comes from, for example *Chapter XXVI: Recurring Decimals › The Third Method (part 19/36)*, and its `source` ends in the **PDF page** (not a printed page: a scan can hold two printed pages per PDF page).
4. **Drops what is not knowledge**: a chunk needs real prose (a share of ordinary function words such as *the*, *of*, *and*), few one-off misreads and not mostly symbols. Contents lists, formula debris and tables are dropped; the log says how many (`15 dropped as noise`).

**Three books are loaded so far** (870 entries): *Vedic Mathematics* by Bharati Krishna Tirthaji (a 1981 scan, 40 chapters), the SCERT Delhi manual *Fundamentals and Applications of Vedic Mathematics*, and the IGNTU course *Science and Technology in Ancient India*. All three are labelled `interpretation`: they are modern works, and the claim that the sixteen sutras come from the Vedas is not supported by the surviving Vedic texts, so the bot says "according to this book" rather than stating them as fact. Change a book's `provenance` in `sources.json` and re-run `npm run ingest` if you disagree.

**Book chunks and the hand-written entries live side by side** (`kind: "book"` marks a chunk; the library has 151 hand-written entries and 870 book chunks). Retrieval protects the hand-written ones: a book chunk needs a text score of at least 4 to be shown at all (real questions about the books score 9.8 or more, off-topic ones 3.0 at most, so "capital of France" finds nothing instead of a glass-making page), it ranks at 80% of its score against a hand-written entry, no more than two chunks of one section appear in one answer, and words every entry shares ("Vedic", "mathematics", "method") are set aside when a question also has two specific words, so "Vedic method for recurring decimals" finds the recurring-decimals chapter. Measured with the real library: each hand-written entry is still found by its own question (134 first and 151 of 151 in the top four, better than before the books), and `npm run calibrate` stays at 98.9% (the same as before the books). `npm run calibrate -w server -- --books` includes the book chunks too.

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

Topics none of the loaded files cover are not guessed: the bot says the knowledge base has nothing and offers what it does have. Add more books the same way.

## Checking answer quality

`npm run eval` asks the question bank (`data/raw/questions_extended.csv`) through the real app, one fresh chat per question, and writes `data/processed/eval-report.md` for you to read. Options: `-- --category traps|sutras|science|calc`, `-- --limit 10`, `-- --calc` (also the 47 exact calculations). Scoring is a keyword check, not a judge model, so read the REVIEW rows yourself. The knowledge-type answers from that file were also loaded into the knowledge base, so a good score shows the pipeline works, not that the bot generalises: for a fair test keep some questions out of `data/raw`.

The 47 exact calculations are also a **unit test** (`server/tests/solver-more.test.js`): the solver must answer every one correctly using the technique the question names.

## Tests

```bash
npm test
```

Server tests (Vitest, 360+ tests): auth; solver with seeded random inputs and edge cases; chat routes (ownership, DB-built history, history limit, SSE, abort with partial save, mid-stream errors); the Gemini tool loop with a scripted fake client; the Groq, OpenAI and Mistral adapters with fake streams (forced tools, rate limits, cut-off streams); the cross-provider chain and its circuit breaker; Cohere titles and fallbacks; the Shastrarth battle route and leaderboard; model health checks and transient-error handling; **Pramana** (exact scores, claim analysis, calibration on synthetic entries, property and hostile-input tests); ingestion cleaning and the whole-book pipeline (OCR repair, chapter finding, quality filter, the real Tirthaji scan, retrieval floor and ranking); and an end-to-end memory flow. They run against an in-memory MongoDB started once. **The first ever run downloads a mongod binary (~800 MB, a few minutes).** To use your own MongoDB, set `TEST_MONGO_URI=mongodb://127.0.0.1:27017/`.

The unit tests use fake model clients, so they prove the plumbing, not the quality of Gemini's answers. That's what `npm run check:live` is for.

## Deploying

The simplest setup is **one web service** that serves both the API and the built React app, so cookies are same-origin and there is no CORS or cross-site cookie trouble.

1. **MongoDB Atlas**: create a cluster and a database user, allow your host's IPs under *Network Access*, and copy the connection string.
2. **Load the data**: from your machine, with `MONGO_URI` in `server/.env` pointing at Atlas, run `npm run ingest`.
3. **Render** (or any Node host): create a *Web Service* from this repo.
   * Build command: `npm install && npm run build`
   * Start command: `npm run start -w server`
   * Environment: `NODE_ENV=production`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MISTRAL_API_KEY`, `MISTRAL_MODEL`, `GROQ_API_KEY`, `COHERE_API_KEY`, optionally `OPENAI_API_KEY`, `CHAT_HISTORY_LIMIT`, and `CLIENT_URL=https://your-app.onrender.com` (the service's own URL).
4. Open the URL, sign up and chat. Check `GET /api/health` (`{"ok":true,"ai":"ready"}`).

In production the cookie is `httpOnly` + `Secure`, error responses never include stack traces, and the server refuses to start with a placeholder `JWT_SECRET`.

**Hosting the client separately** (e.g. Vercel) also works but is more fragile: build the client with `VITE_API_URL=https://your-api`, set `CLIENT_URL` to the client's URL, and set `COOKIE_SAMESITE=none`. Browsers that block third-party cookies will break login in that setup, which is why the single-service route is recommended.

## Project layout

```

├── client/src/{pages,components,api,context,hooks}   React app (Chat, Shastrarth, Profile, BattleCard, PramanaPanel, Charts, ActivityTrail, arena/…)
├── client/public/{bg.jpg, bg-light.jpg, arena-*.jpg}  dark and light theme backgrounds, and the Shastrarth arena artwork
├── server/
│   ├── routes/ (auth, chats, models, profile)  middleware/  models/ (User, Chat, Knowledge, Image)  config/ (env, tiers, models)  utils/
│   ├── services/
│   │   ├── providers/ (toolLoop, openaiCompat, groq, openai, mistralChat)   gemini.js   chain.js   ai.js   titles.js (Cohere)
│   │   ├── verifier.js  claims.js  glossary.js  textutil.js  intent.js  battle.js  arenaStats.js  activity.js   Pramana + Shastrarth
│   │   ├── solver/  rag.js  tools.js  prompt.js  webSearch.js  profile.js  mockAi.js
│   ├── scripts/ (check-live, check-models, calibrate, bakeoff, eval, list-models)
│   └── tests/
├── data/{raw, processed, ingest.js, books.js, formats.js}
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

Chat API (all require login): `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/:id`, `POST /api/chats/:id/messages` (SSE). Also `GET /api/models` (levels, the Shastrarth arena, capabilities), `GET /api/profile/stats` and `GET /api/profile/arena`.

## Troubleshooting

* **"No AI provider is configured…"** in the chat: set at least one of `GEMINI_API_KEY`, `MISTRAL_API_KEY` or `GROQ_API_KEY` (and the model names) in `server/.env` and restart.
* **`check:live` warns that a key is rejected (HTTP 401)**: re-copy that key from the provider's dashboard (the app keeps working through the other providers). For OpenAI, a pasted key that starts `sk-sk-proj-` has a doubled prefix (repaired automatically), but the rest must match the dashboard exactly.
* **Sutra Plus or Pro answer from a lower level a lot**: the free tiers are small (see *Models, levels and free-tier limits*). The notice says which model answered; a paid plan removes the limits.
* **"The AI model was not found"**: `GEMINI_MODEL` isn't a valid model ID for your key.
* **Chats answer "knowledge base has nothing"**: run `npm run ingest`.
* **Can't connect to MongoDB**: start Docker (`docker compose up -d`) or check your Atlas URI and IP allow-list.
* **`querySrv ECONNREFUSED` with an Atlas (`mongodb+srv://`) URL**: your computer hands Node a local DNS server (often a VPN, Docker or WSL adapter) that refuses SRV lookups. The app now retries automatically with public DNS (1.1.1.1 / 8.8.8.8) and prints a one-line notice. To choose resolvers yourself set `DNS_SERVERS=1.1.1.1,8.8.8.8` in `server/.env`.
* **Rate limited**: adjust `AUTH_RATE_LIMIT` / `CHAT_RATE_LIMIT` (see `.env.example`).
