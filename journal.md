# Journal Module — Implementation Log



> Living build journal for the hybrid journaling upgrade spec'd in [`journalguide.md`](./journalguide.md).

> Update this file after each meaningful slice of work: what shipped, what broke, what's next.



**Last updated:** 2026-05-27  

**Overall status:** Core + polish + mobile lokta UI shipped



---



## Current snapshot



| Area | Status |

|---|---|

| Data model (`DailyJournal` + `QuickNote`) | ✅ Done |

| Zero-loss migration from legacy entries | ✅ Done (reuses `journalentries` collection) |

| Main journal screen (anchor + quick notes) | ✅ Done |

| Calendar sidebar + search + recents | ✅ Done |

| Autosave + optimistic quick notes | ✅ Done |

| Per-day AI reflection | ✅ Done |

| Weekly AI aggregation (briefing) | ✅ Done |

| Offline-first / localStorage persist | ✅ Done |

| Note type picker (`note`, `idea`, `task`, `gratitude`) | ✅ Done |

| Mood trends strip (30-day) | ✅ Done |

| Mobile calendar drawer | ✅ Done (inline expandable panel) |
| Lokta / Nepali old-paper journal editor | ✅ Done |

| Frontend note pagination | ✅ Done (50 per page) |

| Note list virtualization | ⬜ Not started |

| Full mood analytics dashboard | ⬜ Not started |



---



## Architecture (as built)



### Data model



```

DailyJournal (1 per user per day)

├── mood, title, content, tags, aiSummary

└── collection: journalentries  ← legacy docs read as-is



QuickNote (many per day)

├── journalId → DailyJournal

├── date (denormalised for indexed day queries)

├── content, type, pinned

└── auto-creates parent DailyJournal on POST

```



**Indexes**

- `DailyJournal`: `{ userId, date }` unique · `{ userId, updatedAt }`

- `QuickNote`: `{ userId, date, createdAt }` · `{ journalId }`



### API surface



| Route | Purpose |

|---|---|

| `GET/PUT /api/journal` | Load / autosave daily anchor · paginated notes via `notesLimit`/`notesSkip` |

| `GET/POST /api/journal/notes` | List (paginated) / create quick notes |

| `PATCH/DELETE /api/journal/notes/[id]` | Edit / delete note |

| `GET /api/journal/calendar` | Month mood + presence map |

| `GET /api/journal/search` | Full-text search grouped by day |

| `POST /api/journal/reflect` | Groq per-day AI summary → `aiSummary` |

| `POST /api/ai/briefing` | Weekly rollup: journals + notes + habits + portfolio |



### Frontend



```

src/features/journal/

├── store.js                  Zustand + persist — debounced autosave, pagination

├── constants.js              NOTE_TYPES, NOTE_PAGE_SIZE

├── actions.js                Server-side data loaders

└── components/

    ├── journal-screen.jsx    Two-column layout · mobile drawer · load more

    ├── calendar-sidebar.jsx  Calendar · search · recents · mood strip

    ├── daily-anchor-card.jsx Mood · title · content · tags · AI

    ├── mood-picker.jsx

    ├── mood-trends.jsx       30-day mood strip

    ├── quick-note-input.jsx  Type picker + Enter-to-save capture

    └── quick-note-card.jsx   Pin · edit · delete · expand · type badge

```



### State & autosave strategy



- Anchor journal: local edit → 1.1s debounce → `PUT /api/journal` → calendar map update

- Quick notes: optimistic insert → `POST` → rollback on failure

- **localStorage:** draft journal, notes, calendar cache, save status via Zustand `persist`

- **Draft recovery:** on hydrate, unsaved local draft wins over server; auto-retries flush

- Tab hide / beforeunload / **online reconnect:** `flushSave()` so edits aren't lost

- Notes: 50 per page; "Load more" when `notesHasMore`

- Timezone: server renders UTC "today"; client re-anchors to local date on mount



---



## Spec checklist (`journalguide.md`)



### ✅ Shipped



- [x] Split schema: `DailyJournal` + `QuickNote`

- [x] One anchor per user per day; unlimited quick notes

- [x] Silent `DailyJournal` creation when note is captured first

- [x] Left sidebar: calendar, mood tinting, recents, search

- [x] Main area: mood picker, optional title, long-form reflection, tags

- [x] Save status indicator (Saving / Saved / Retrying)

- [x] Quick note stack: chronological, pinned-first, inline edit, delete, timestamps, expand/collapse

- [x] Keyboard-first capture (Enter / Shift+Enter)

- [x] AI per-day reflection with anchor + notes context

- [x] AI weekly reflection pipeline in `/api/ai/briefing`

- [x] Migration without data loss (same MongoDB collection)

- [x] User isolation on all routes

- [x] Duplicate-date race handling (11000 retry on upsert)

- [x] Empty states, loading skeletons, toast feedback

- [x] **localStorage persist** with draft recovery on reload

- [x] **Note type picker** in quick-note input

- [x] **30-day mood trends strip** in sidebar

- [x] **Mobile calendar drawer** (Dialog on `< lg`)

- [x] **Frontend note pagination** (50/page, load more)



### ⬜ Remaining / future



- [ ] **Virtualised note list** — needed if a day accumulates hundreds of notes

- [ ] **Full mood analytics dashboard** — charts, streaks, mood-over-time views

- [ ] **Delete / clear anchor journal** — no explicit "clear day" action

- [ ] **Offline edit queue** — retry sync when back online (partial: online event flushes anchor)

- [ ] **Autosave conflict resolution** — last-write-wins only; no merge strategy

- [ ] **Semantic search** — current search is regex over title/content/tags

- [ ] **Dedicated `WeeklyReflectionCard`** — weekly insights live in Review page briefing

- [ ] **Global keyboard shortcuts** — e.g. `n` for new note, `/` for search focus



---



## Changelog



### 2026-05-27 — Mobile calendar + lokta paper journal UI

- Replaced mobile Dialog with **inline expandable calendar** (sticky header, 44px touch cells).
- Daily anchor editor styled as **Nepali lokta/kagaj paper** — ruled lines, cream texture, maroon accent, Lora serif.
- Mood picker: emoji-only on small screens; paper variant on journal.
- Mood trend strip: horizontally scrollable on mobile.



### 2026-05-27 — Polish slice (persist, types, mood strip, mobile, pagination)



**Store (`store.js`)**

- Wrapped with Zustand `persist` → `localStorage` key `journal-store`

- Draft recovery: unsaved anchor wins on hydrate; auto-retries `flushSave`

- Added `notesTotal`, `notesHasMore`, `loadMoreNotes`, `loadingMoreNotes`

- `selectDate` fetches first 50 notes via `notesLimit`/`notesSkip` query params



**API (`/api/journal`)**

- GET now supports `notesLimit` + `notesSkip`; returns `notesTotal` + `notesHasMore`



**UI**

- `quick-note-input.jsx` — type picker chips (note / idea / task / gratitude)

- `quick-note-card.jsx` — type badge for non-default types

- `mood-trends.jsx` — 30-day clickable mood strip in sidebar

- `journal-screen.jsx` — mobile "Calendar & search" dialog; load-more button; online reconnect flush

- `calendar-sidebar.jsx` — `onDateSelect` callback for mobile drawer close



**Next recommended slice:** virtualised note list or global keyboard shortcuts.



### 2026-05-27 — Status audit & log init



- Created this implementation log (file was empty).

- Verified core hybrid journal is fully wired end-to-end against `journalguide.md`.



### 2026-05-18 — Loader polish



- Added route-level loading skeletons (`src/app/loading.jsx`, dashboard variant).



### 2026-05-18 — Weekly planner (adjacent module)



- Shipped `/planner` with `PlannerGoal` model and review summary component.



### 2026-05-17 — Hybrid journal v1 (major)



**Commit:** `a0f84a4` — *added feature in journal*



- Introduced `DailyJournal` + `QuickNote` models with backward-compatible collection binding.

- Built full journal UI: calendar sidebar, daily anchor card, quick note capture/cards.

- Added API routes: journal CRUD, notes CRUD, calendar, search, reflect.

- Updated `/api/ai/briefing` to aggregate daily journals + quick notes using the spec's day format.



### 2026-05-17 — First draft & improvements



- Initial Personal OS scaffold: auth, dashboard shell, goals, portfolio, review.

- PWA support, `.env.example`, navigation rename (Compass → Goals, etc.).



---



## Next up (priority queue)



1. **Virtualised note list** — `@tanstack/react-virtual` when a day has 100+ notes

2. **Global keyboard shortcuts** — `/` focus search, `n` focus quick-note input

3. **Clear day action** — soft-delete anchor content with confirmation

4. **Offline queue** — queue failed note POSTs and retry on reconnect

5. **Mood analytics page** — dedicated chart view beyond the 30-day strip



---



## Edge cases — current behaviour



| Case | Handling |

|---|---|

| Quick note before anchor content | `ensureDailyJournal()` creates empty anchor silently |

| Empty day | Anchor card shows placeholders; notes section shows empty state |

| Rapid note creation | Each note gets own optimistic temp ID; independent POSTs |

| Autosave race on first write | Mongo 11000 caught; retry as plain update |

| Partial AI failure | Toast error; existing `aiSummary` preserved |

| Timezone mismatch (SSR vs client) | Client re-selects local today after hydrate |

| Extremely long notes | Collapsed at 240 chars with expand toggle |

| Future dates | Calendar buttons disabled for dates > today |

| Page reload mid-edit | localStorage draft restored; autosave retried |

| 50+ notes on one day | First 50 shown; "Load more" fetches next batch |

| Offline anchor edit | Draft persisted locally; flush on `online` event |



---



## Files to touch for common tasks



| Task | Primary files |

|---|---|

| Anchor autosave timing | `src/features/journal/store.js` |

| Quick note UX | `quick-note-input.jsx`, `quick-note-card.jsx` |

| Calendar tinting | `calendar-sidebar.jsx`, `mood-picker.jsx` |

| Mood trends | `mood-trends.jsx` |

| AI prompts | `api/journal/reflect/route.js`, `api/ai/briefing/route.js` |

| Schema changes | `models/DailyJournal.js`, `models/QuickNote.js` |

| Server initial load | `features/journal/actions.js`, `journal/page.jsx` |



---



*Append new dated sections under **Changelog** and refresh the snapshot table when status changes.*

