# AGENTS.md - AI Agent Guidelines for HypnoRaffle

This document provides guidance for AI agents working on the HypnoRaffle codebase.

## Project Overview

**HypnoRaffle** is a real-time raffle application with hypnotic visual effects. Users can join via QR code, and winners are selected through an engaging slot machine animation.

### Tech Stack

- **Framework**: Next.js 15 with App Router (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Database**: Neon serverless Postgres, reached from the browser through the Neon Data API (`@neon/neon-js`, anonymous tokens). Schema: `docs/neon/schema.sql`. (The Docker PostgreSQL + PostgREST setup is legacy/self-hosted only.)
- **AI Integration**: Google Genkit (optional)
- **Deployment**: GitHub Pages static export at qr.ai-know.org (production); Docker with Cloudflare Tunnel (optional self-hosted)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Main raffle host view
│   ├── qr/page.tsx        # Participant join page (QR scan destination)
│   └── qr-display/page.tsx # Dedicated QR code display screen
├── components/
│   ├── layout/            # Layout components (Header)
│   ├── raffle/            # Raffle-specific components
│   │   ├── Confetti.tsx   # Celebration effects
│   │   ├── ParticipantImporter.tsx
│   │   ├── ParticipantsList.tsx
│   │   ├── SessionIndicator.tsx
│   │   ├── SlotMachine.tsx # Main raffle animation
│   │   └── SoundToggle.tsx # Speaker button (mute drum roll / applause)
│   └── ui/                # shadcn/ui components (DO NOT MODIFY)
├── context/               # React Context providers
│   ├── ParticipantsContext.tsx
│   ├── QrModalContext.tsx
│   └── SessionContext.tsx
├── hooks/                 # Custom React hooks
│   ├── use-participants.ts # Participants polling hook
│   ├── use-raffle-sounds.ts # Drum roll while spinning, applause on the winner, mute
│   ├── use-session.ts     # Session management
│   └── use-toast.ts       # Toast notifications
├── lib/                   # Utilities and configurations
│   ├── db.ts              # Database client (Neon Data API, anonymous access)
│   ├── image-data-url.ts  # Image upload -> downscaled data: URL (stored in rows)
│   ├── poll-gate.ts       # When live polling pauses (idle / hidden tab)
│   ├── youtube-sound.ts   # YouTube video as a sound effect (invisible 200x200 player)
│   └── utils.ts           # Helper functions (secureRandom, cn, etc.)
├── types/                 # TypeScript type definitions
│   └── index.ts           # Participant, Session interfaces
└── ai/                    # Genkit AI configuration (optional feature)
```

## Key Concepts

### Sessions

- Each raffle instance has a unique `session_id` (UUID)
- Sessions isolate participants between different raffle events
- Session ID is displayed in the UI and stored in the browser

### Participants

```typescript
interface Participant {
  id: string;
  name: string;
  last_name: string;
  display_name: string;
  session_id?: string;
  email?: string;
  won?: boolean;  // Tracks if participant has won
}
```

### Polling for Updates

Since PostgREST doesn't support real-time subscriptions, use polling:

```typescript
useEffect(() => {
  const fetchData = async () => {
    const { data } = await db.from('participants').select('*').eq('session_id', sessionId);
    setParticipants(data || []);
  };
  
  fetchData();
  const interval = setInterval(fetchData, 2000); // Poll every 2 seconds
  return () => clearInterval(interval);
}, [sessionId]);
```

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `"use client"` directive for client-side components
- Follow existing patterns in the codebase

### Component Guidelines

1. **UI Components** (`src/components/ui/`): These are shadcn/ui components. Do not modify directly. To add new components, use the shadcn CLI.

2. **Raffle Components** (`src/components/raffle/`): Core business logic components. These can be modified.

3. **Context Providers**: Wrap the app in providers defined in `src/context/`. Access state via custom hooks.

### Database Operations

- Always use the database client from `@/lib/db` (Neon Data API via `@neon/neon-js`)
- Include `session_id` when inserting participants
- Row Level Security (RLS) is enabled; the `anonymous` role has open policies and grants on the app tables (see `docs/neon/schema.sql`)
- Images (raffle gallery, QR logos) are stored in their rows as `data:` URLs via `fileToDataUrl()`; there is no storage bucket
- Participant polling pauses after 10 idle minutes or while the tab is hidden (Neon free-plan compute quota); any click/key resumes it

### Environment Variables

Required environment variables (see `.env.example`):
```
# Database: Neon base URL (the Data API and Neon Auth URLs are derived from it)
NEXT_PUBLIC_NEON_URL=https://ep-xxx.c-N.<region>.aws.neon.tech/neondb

# Optional
NEXT_PUBLIC_WINNER_WEBHOOK_URL=<optional_webhook_url>
NEXT_PUBLIC_SITE_PASSWORD_HASH=<sha256_of_site_password>
NEXT_PUBLIC_POLL_IDLE_MS=600000   # local testing only: pause live updates sooner
```

The deploy workflow fails before building when `NEXT_PUBLIC_NEON_URL` is missing or malformed (`scripts/check-neon-url.mjs`).

Legacy self-hosted Docker (PostgreSQL + PostgREST) only:
```
POSTGRES_USER=hypnoraffle
POSTGRES_PASSWORD=<secure_password>
POSTGRES_DB=hypnoraffle
NEXT_PUBLIC_POSTGREST_URL=http://localhost:3001
JWT_SECRET=<min_32_char_secret>
NEXT_PUBLIC_APP_URL=http://localhost:9002
CLOUDFLARE_TUNNEL_TOKEN=<tunnel_token>
```

## Common Tasks

### Adding a New Page

1. Create a new directory under `src/app/`
2. Add a `page.tsx` file with the page component
3. Use `"use client"` if the page needs client-side features

### Adding a New Component

1. Create the component in the appropriate directory
2. Use TypeScript interfaces for props
3. Import UI components from `@/components/ui/`

### Modifying Database Schema

1. Update SQL in `docker/init.sql`
2. Rebuild containers: `docker compose down && docker compose --profile dev up --build`
3. Update TypeScript types in `src/types/index.ts`

### Working with Participants

```typescript
// Fetch participants
import { db } from '@/lib/db';

const { data, error } = await db
  .from('participants')
  .select('*')
  .eq('session_id', sessionId);

// Insert participant
await db.from('participants').insert({
  name: 'John',
  last_name: 'Doe',
  display_name: 'John D.',
  session_id: sessionId,
  email: 'john@example.com'
});

// Mark winner
await db
  .from('participants')
  .update({ won: true })
  .eq('id', participantId);

// Create session with QR code (RPC call)
const { data } = await db.rpc('create_session_with_qr', { 
  session_name: 'My Raffle' 
});
```

## Testing & Validation

- Run `npm test` (Vitest + jsdom) for unit tests
- Run `npm run typecheck` to verify TypeScript types
- Run `npm run lint` for linting
- Run `npm run build` to ensure build works

## Docker Commands

```bash
# Development (with hot-reload)
docker compose --profile dev up --build

# Production
docker compose --profile prod up -d --build

# With Cloudflare Tunnel
docker compose --profile prod --profile tunnel up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Reset database (DELETES DATA)
docker compose down -v
```

## Git Configuration

This repo has two remotes:
- `origin` - Internal deployment (git-thetary)
- `personal` - GitHub personal repo (github.com:LeonMelamud/qr-tools.git)

**Always push to the `personal` remote for deployment:**

```bash
git push personal main
```

## GitHub Actions Deployment

The site is deployed to GitHub Pages via GitHub Actions.

```bash
# Trigger a rebuild without pushing code changes
gh workflow run deploy.yml

# Or push an empty commit to trigger rebuild
git commit --allow-empty -m "Trigger rebuild" && git push personal main
```

### Environment Secrets (GitHub)

Set these in GitHub repo → Settings → Secrets and variables → Actions:
- `NEXT_PUBLIC_NEON_URL` - Neon database base URL
- `NEXT_PUBLIC_WINNER_WEBHOOK_URL`
- `NEXT_PUBLIC_SITE_PASSWORD_HASH` - SHA-256 hash of site password

Generate password hash:
```bash
node -e "const crypto = require('crypto'); console.log(crypto.createHash('sha256').update('your-password').digest('hex'));"
```

## Important Notes

1. **Docker Deployment**: The app runs in Docker with PostgreSQL + PostgREST. Use `docker compose --profile dev up` for development.

2. **Secure Random**: Use `secureRandom()` from `@/lib/utils` for winner selection, not `Math.random()`.

3. **Toast Notifications**: Use the `useToast()` hook for user feedback.

4. **Polling for Updates**: Since PostgREST doesn't support real-time, use polling or implement SSE for live updates.

5. **Session Isolation**: Always filter data by `session_id` to prevent cross-session data leaks.

6. **Security**: RLS policies are in `docker/init.sql`. JWT authentication is available for admin features.

## File Naming Conventions

- Components: PascalCase (`SlotMachine.tsx`)
- Hooks: kebab-case with `use-` prefix (`use-participants.ts`)
- Utilities: kebab-case (`utils.ts`)
- Types: PascalCase for interfaces, camelCase for type aliases
