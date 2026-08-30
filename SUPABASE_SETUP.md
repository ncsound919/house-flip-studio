# Supabase Setup Guide — NC House Flip Studio

This project uses Supabase (Postgres + Auth + Realtime) for its database and auth layer.

> **Status: configured.** The hosted project already exists and migrations are applied:
>
> - Project ref: `ngapchaxevbrfhfyscgx`
> - Region: East US (North Virginia), Free tier
> - Dashboard: https://supabase.com/dashboard/project/ngapchaxevbrfhfyscgx
> - Local `.env.local` points at this project (URL + anon + service_role keys).
>
> This guide documents how to reproduce that setup on a fresh project.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up / sign in.
2. Click **New project**.
3. Pick an organization, name the project (e.g. `nc-house-flip-studio`), set a database password, and choose a region near your users (e.g. `us-east-1`). The **free tier** is sufficient for two partners.
4. Wait for provisioning to finish (a minute or two).

## 2. Run the migrations

The schema lives in `supabase/migrations/`. There are three files, run in order:

1. `001_initial_schema.sql` — creates all tables, enums, and the profile trigger
2. `002_rls_policies.sql` — enables RLS and adds row-level security policies
3. `003_realtime_publication.sql` — adds tables to the realtime publication (required for Kanban live updates)

### Option A — SQL Editor (recommended for manual setup)

1. In the Supabase dashboard, go to **SQL Editor**.
2. Open `001_initial_schema.sql` from this repo, paste it into a new query, and click **Run**.
3. Repeat for `002_rls_policies.sql`.

### Option B — CLI (if you have the Supabase CLI)

```bash
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## 3. Get your URL and keys

1. In the dashboard, go to **Project Settings → API**.
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep private, server-side only)
3. Go to **Project Settings → Data API** to confirm Realtime is enabled (it is by default).

## 4. Add keys to your local `.env`

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Never commit real keys. `.gitignore` already excludes `.env*`.

## 5. Optional: Realtime for the Kanban board

The Kanban board uses Supabase Realtime subscriptions. Realtime is enabled by default for the `deals` table changes when using the public schema. If realtime isn't working:

1. In the dashboard go to **Database → Replication**.
2. Under **Supabase Realtime**, add the `deals` table (or all tables).
3. Republish the app (the browser subscription will reconnect).

## 6. Two users in the same org

On first sign-up, the `handle_new_user()` trigger assigns the new profile to the **default org** (created if none exists). Both partners land in the same org and can see each other's data via RLS. No extra setup needed for the two-person case.
