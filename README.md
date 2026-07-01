# NEXUBOTICS Workspace

Team collaboration, project delivery, and CRM platform. Built with React (JavaScript), Supabase, and deployed to Netlify.

## Features

- **Dashboard** — metrics, charts, completion rate, upcoming deadlines, AI insights
- **Projects** — Kanban board per project, AI task generation, automations, activity log
- **Tasks** — multi-assignee kanban + list view, subtasks, checklists, comments with @mentions, attachments, drag-and-drop
- **Messages** — channels + DMs with end-to-end encryption (AES-GCM), reactions, pins, replies, file sharing, voice notes, typing presence
- **Clients/CRM** — 3-step onboarding wizard, auto-project creation, AI task generation via OpenAI
- **Team** — member management, custom roles, onboarding steps, password reset, profile edit history
- **Performance** — leaderboard, ratings (1-10), completion history (individual + group tasks)
- **Scheduler** — meetings, attendees, Google Calendar export, instant Meet link
- **Active Users** — realtime online/offline status (5-min window)
- **Session Management** — single-device / multi-device policy per user
- **Settings** — profile, avatar upload, appearance (light/dark/system), unsaved-changes guard
- **Notifications** — realtime bell with sound, browser push, preferences
- **Announcements** — admin-managed workspace banners
- **Command Palette** — ⌘K / Ctrl+K navigation
- **AI** — project task generation and project summarization via OpenAI GPT-4o-mini

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
| Language | JavaScript (JSX) — no TypeScript |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) |
| AI | OpenAI API (gpt-4o-mini) via Supabase Edge Functions |
| Hosting | Netlify |

---

## Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd nexubotics
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-public-key
```

Both values are in your Supabase project under **Settings → API**.

### 3. Run the database migration

In your Supabase project dashboard, go to **SQL Editor** and run the migration file:

```
supabase/migrations/20260320190125_init_schema.sql
```

Or with the Supabase CLI:

```bash
supabase db push
```

### 4. Set up Supabase Storage buckets

In your Supabase dashboard → **Storage**, create these buckets:

| Bucket name | Public |
|---|---|
| `avatars` | Yes |
| `task-attachments` | No (signed URLs) |
| `task-files` | No (signed URLs) |
| `channel-files` | No (signed URLs) |

### 5. Deploy Edge Functions

```bash
# Install Supabase CLI if needed
npm install -g supabase

supabase login
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy manage-member
supabase functions deploy reset-member-password
supabase functions deploy apply-invite-role
supabase functions deploy create-member
supabase functions deploy task-reminders
supabase functions deploy ai-project-generator
supabase functions deploy ai-insights
```

### 6. Set Edge Function secrets

In Supabase dashboard → **Settings → Edge Functions → Secrets**, add:

```
OPENAI_API_KEY=sk-...your-openai-api-key...
```

The `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically injected by Supabase.

### 7. Run locally

```bash
npm run dev
```

Visit http://localhost:8080

---

## Deploy to Netlify

### Option A: Netlify Dashboard (easiest)

1. Push your code to GitHub/GitLab
2. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
3. Connect your repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Add environment variables in Netlify → **Site settings → Environment variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
6. Click **Deploy**

### Option B: Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set VITE_SUPABASE_URL https://your-project.supabase.co
netlify env:set VITE_SUPABASE_PUBLISHABLE_KEY your-anon-key
netlify deploy --prod
```

---

## First Admin Setup

After deploying, sign up with your email. Then in Supabase SQL editor, promote yourself to admin:

```sql
UPDATE public.user_roles
SET role = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'your@email.com'
);
```

---

## Project Structure

```
nexubotics/
├── src/
│   ├── components/
│   │   ├── ui/          # shadcn/ui primitives (all JSX)
│   │   ├── admin/       # SetUserHandleDialog
│   │   ├── clients/     # NewClientWizard
│   │   ├── projects/    # ProjectKanban, TaskDrawer, ProjectAIPanel, ProjectAutomations
│   │   └── team/        # CustomRolesManager, OnboardingStepsEditor, etc.
│   ├── contexts/        # AuthContext
│   ├── hooks/           # use-mobile, use-toast, useBrowserNotifications, useUnsavedGuard
│   ├── integrations/    # Supabase client
│   ├── lib/             # utils, encryption, messageSync, sessionPolicy, etc.
│   ├── pages/           # All page components
│   └── test/            # Vitest tests
├── supabase/
│   ├── functions/       # Deno Edge Functions
│   └── migrations/      # SQL migrations
├── public/
├── netlify.toml         # Netlify build + SPA redirect config
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## Scripts

```bash
npm run dev       # Start dev server on :8080
npm run build     # Production build → dist/
npm run preview   # Preview production build locally
npm run test      # Run unit tests (Vitest)
npm run lint      # ESLint
```

---

## Notes

- **No TypeScript** — all files are `.jsx`/`.js`
- **No Lovable dependencies** — `lovable-tagger` and `lovable-agent-playwright-config` are fully removed
- **E2E encryption** — messages in encrypted channels use AES-GCM (Web Crypto API) with per-channel keys stored in Supabase
- **AI features** — require `OPENAI_API_KEY` set as a Supabase Edge Function secret; gracefully degrade if not set
- **Single-device policy** — enforced via the `user_sessions` table; admin can grant multi-device per user
