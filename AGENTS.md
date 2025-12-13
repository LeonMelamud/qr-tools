# AGENTS.md - AI Agent Guidelines for HypnoRaffle

This document provides guidance for AI agents working on the HypnoRaffle codebase.

## Project Overview

**HypnoRaffle** is a real-time raffle application with hypnotic visual effects. Users can join via QR code, and winners are selected through an engaging slot machine animation.

### Tech Stack

- **Framework**: Next.js 15 with App Router (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **AI Integration**: Google Genkit (optional)
- **Deployment**: GitHub Pages (static export)

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
│   │   └── SlotMachine.tsx # Main raffle animation
│   └── ui/                # shadcn/ui components (DO NOT MODIFY)
├── context/               # React Context providers
│   ├── ParticipantsContext.tsx
│   ├── QrModalContext.tsx
│   └── SessionContext.tsx
├── hooks/                 # Custom React hooks
│   ├── use-participants.ts # Supabase participants subscription
│   ├── use-session.ts     # Session management
│   └── use-toast.ts       # Toast notifications
├── lib/                   # Utilities and configurations
│   ├── supabase.ts        # Supabase client initialization
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

### Real-time Updates

- Supabase real-time subscriptions keep participant list in sync
- Changes are broadcast to all connected clients immediately

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

- Always use the Supabase client from `@/lib/supabase`
- Include `session_id` when inserting participants
- Use real-time subscriptions for live updates
- Row Level Security (RLS) is enabled - respect policies

### Environment Variables

Required environment variables:
```
NEXT_PUBLIC_SUPABASE_URL=<supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
NEXT_PUBLIC_WINNER_WEBHOOK_URL=<optional_webhook_url>
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

1. Update SQL in `docs/database_schema.sql`
2. Create a migration file in `docs/` if needed
3. Update TypeScript types in `src/types/index.ts`

### Working with Participants

```typescript
// Fetch participants
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('participants')
  .select('*')
  .eq('session_id', sessionId);

// Insert participant
await supabase.from('participants').insert({
  name: 'John',
  last_name: 'Doe',
  display_name: 'John D.',
  session_id: sessionId,
  email: 'john@example.com'
});

// Mark winner
await supabase
  .from('participants')
  .update({ won: true })
  .eq('id', participantId);
```

## Testing & Validation

- Run `npm run typecheck` to verify TypeScript types
- Run `npm run lint` for linting
- Run `npm run build` to ensure static export works

## Important Notes

1. **Static Export**: The app is deployed as a static export to GitHub Pages. Avoid server-side features.

2. **Secure Random**: Use `secureRandom()` from `@/lib/utils` for winner selection, not `Math.random()`.

3. **Toast Notifications**: Use the `useToast()` hook for user feedback.

4. **Real-time**: The app relies on Supabase real-time. Ensure subscriptions are properly cleaned up in `useEffect` returns.

5. **Session Isolation**: Always filter data by `session_id` to prevent cross-session data leaks.

## File Naming Conventions

- Components: PascalCase (`SlotMachine.tsx`)
- Hooks: kebab-case with `use-` prefix (`use-participants.ts`)
- Utilities: kebab-case (`utils.ts`)
- Types: PascalCase for interfaces, camelCase for type aliases
