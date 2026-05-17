You are a senior product engineer helping me upgrade my existing journaling application from a simple “one journal entry per day” model into a production-grade hybrid journaling system.

The goal is to improve:
- user retention
- emotional usability
- low-friction note capture
- AI-powered weekly reflection quality

The new architecture should combine:

1. Daily Anchor Journal
2. Unlimited Quick Sticky Notes

The Daily Anchor Journal acts as the structured emotional backbone of the day.
Quick Sticky Notes act as lightweight contextual thoughts attached to that day.

The app should feel like:
- Apple Journal
- Reflect.app
- Day One
- Notion daily notes + sticky capture

The UX philosophy is extremely important:
The user should never feel pressured to write a long diary entry.
Capturing thoughts should feel instant, lightweight, and emotionally safe.

--------------------------------------------------
CORE PRODUCT MODEL
--------------------------------------------------

Each day contains:

1. One Daily Anchor Journal
- mood
- optional title
- long-form reflection
- tags
- AI reflection support

2. Multiple Quick Sticky Notes
- unlimited per day
- lightweight
- timestamped
- fast capture
- no friction
- stack chronologically

The Daily Journal is the “spine”.
Quick Notes are the “context”.

Users should browse historically by:
- calendar
- timeline
- search
- mood trends

Clicking any date should show:
- daily journal
- all quick notes from that date

No entries should ever feel hidden or lost.

--------------------------------------------------
DATABASE / DATA MODEL REQUIREMENTS
--------------------------------------------------

Refactor the existing schema into two separate models:

DailyJournal
Fields:
- id
- userId
- date (YYYY-MM-DD)
- mood
- title
- content
- tags
- aiSummary
- createdAt
- updatedAt

QuickNote
Fields:
- id
- journalId
- userId
- content
- type
- pinned
- createdAt

Rules:
- one DailyJournal per user per day
- many QuickNotes per DailyJournal
- QuickNotes belong to a DailyJournal
- if QuickNote is created before DailyJournal exists, auto-create the DailyJournal silently

--------------------------------------------------
MAIN JOURNAL SCREEN UX
--------------------------------------------------

Design the journaling screen with:

LEFT SIDEBAR
- calendar
- mood indicators
- recent entries
- search
- quick date jumping

MAIN CONTENT AREA

SECTION 1 — Daily Anchor Journal
- mood selector
- optional title
- rich text or markdown editor
- autosave
- save status
- AI reflection indicator

SECTION 2 — Quick Sticky Notes
- fast input field
- instant creation
- stacked card layout
- chronological ordering
- inline editing
- delete support
- timestamps
- expand/collapse long notes
- pin important notes

--------------------------------------------------
USER EXPERIENCE REQUIREMENTS
--------------------------------------------------

The app must reduce emotional pressure.

Users should never feel:
- forced to complete a journal
- blocked by forms
- required to write long entries

Quick note capture should:
- autosave
- feel instant
- support mobile usage
- support keyboard-first usage
- support rapid thought dumping

Focus heavily on:
- emotional UX
- low cognitive load
- smooth transitions
- minimal friction
- calm UI behavior

--------------------------------------------------
AI WEEKLY REFLECTION SYSTEM
--------------------------------------------------

The AI review system should aggregate:
- all DailyJournal entries
- all QuickNotes

DailyJournal entries have higher emotional weight.
QuickNotes provide emotional texture and context.

The AI should detect:
- emotional trends
- recurring stress
- repeated topics
- positive patterns
- gratitude moments
- burnout signals
- energy shifts

Generate:
- weekly emotional summary
- recurring themes
- suggested focus areas
- gratitude reflections
- emotional insights

Future-proof the AI context pipeline.

Example formatting:

DATE: 2026-05-10
Mood: anxious

Daily Reflection:
"..."

Quick Notes:
- "argument during meeting"
- "felt productive after gym"
- "need better sleep"

--------------------------------------------------
BACKEND REQUIREMENTS
--------------------------------------------------

Implement:
- optimized queries
- pagination for notes
- date-based indexing
- autosave endpoints
- debounced updates
- optimistic updates
- transactional creation logic
- validation
- proper error handling
- scalable architecture

Need:
- APIs for DailyJournal
- APIs for QuickNotes
- aggregation APIs
- AI preparation pipeline

Ensure:
- user isolation
- performance optimization
- future scalability

--------------------------------------------------
FRONTEND REQUIREMENTS
--------------------------------------------------

Follow the existing architecture and coding conventions already present in the project.

Create reusable components.

Suggested architecture:

- JournalLayout
- CalendarSidebar
- DailyAnchorCard
- MoodPicker
- QuickNoteInput
- QuickNoteCard
- WeeklyReflectionCard
- JournalSearch

Implement:
- loading states
- skeleton states
- empty states
- optimistic UI updates
- mobile responsiveness
- keyboard shortcuts where useful
- smooth animations/transitions

The UI should feel calm and modern.

--------------------------------------------------
MIGRATION REQUIREMENTS
--------------------------------------------------

The current system already has:
- one journal entry per day

Need a migration strategy where:
- old entries become DailyJournal records
- no data loss occurs
- old functionality remains stable during migration
- backward compatibility is preserved if possible

--------------------------------------------------
PERFORMANCE REQUIREMENTS
--------------------------------------------------

Think carefully about:
- indexing
- pagination
- rendering performance
- note virtualization if needed
- caching
- optimistic updates
- autosave race conditions
- search scalability

Avoid naive implementations.

--------------------------------------------------
EDGE CASES TO HANDLE
--------------------------------------------------

Consider:
- empty journal days
- quick notes without anchor content
- offline edits
- autosave conflicts
- rapid note creation
- deleting anchor journals
- timezone handling
- duplicate date creation
- partial AI failures
- extremely long notes

--------------------------------------------------
FUTURE EXTENSIBILITY
--------------------------------------------------

Design architecture so future features can be added easily:

Possible future features:
- AI chat over journal history
- semantic search
- mood analytics dashboard
- reminders
- notifications
- streaks
- voice notes
- attachments/images
- offline-first sync
- collaborative therapist sharing
- AI emotional trend graphs
- encrypted journaling
- tagging systems
- cross-day linking
- templates

Do not hardcode architecture in ways that block future extensibility.

--------------------------------------------------
IMPORTANT IMPLEMENTATION EXPECTATIONS
--------------------------------------------------

Do NOT generate superficial CRUD code only.

Think deeply about:
- product architecture
- emotional UX
- scalability
- maintainability
- AI integration
- developer experience
- mobile experience
- clean state management
- production-grade patterns

Provide:
1. database changes
2. migration plan
3. backend architecture
4. frontend architecture
5. state management flow
6. autosave strategy
7. optimistic update strategy
8. AI aggregation pipeline
9. API structure
10. implementation roadmap
11. edge case handling
12. performance optimization suggestions
13. future extensibility guidance

The implementation should feel production-ready and thoughtfully designed, not tutorial-level.