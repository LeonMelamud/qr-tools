# HypnoRaffle

A hypnotic raffle experience built with **Next.js**, **Tailwind CSS**, and **Supabase**.

## Features

- **Real-time Participation**: Join via QR code and see names appear instantly.
- **Hypnotic Visuals**: Engaging animations and "logo rain" effects.
- **Fair Selection**: Secure random winner selection.
- **Supabase Backend**: Robust data storage with Row Level Security.
- **Winner Email**: Sends a styled congratulations email to the winner via an n8n webhook.

## Prerequisites

- **Node.js**: Version 20 or higher.
- **npm**: Package manager.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd studio
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env.local` file in the root directory and add your Supabase credentials:

    ```bash
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
    # Optional: n8n webhook that emails the winner when a draw ends
    NEXT_PUBLIC_WINNER_WEBHOOK_URL=your_n8n_webhook_url
    ```
    *(Note: For local development, ask the team for the current credentials if you don't have them.)*

4.  **Setup Database:**
    Run the SQL script located in `docs/database_schema.sql` in your Supabase SQL Editor to create the necessary tables and policies.

## Running Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:9002](http://localhost:9002) with your browser.

- **Participant View**: Scan the QR code or go to `/qr` to join.
- **Host View**: The main page displays the raffle and participants.
- **QR Display**: Go to `/qr-display` for a dedicated QR code screen.

## Building for Production

Create a production build:

```bash
npm run build
```

This acts as a verification step to ensure all static pages can be generated successfully.

## How the Raffle Works

1. **Add Participants**: Import participants via CSV or let them join by scanning the QR code.
2. **Start Raffle**: Click "Start Raffle" to spin the slot machine.
3. **Winner Selected**: When the spin ends, the winner is displayed and a webhook notification is sent (if configured).
4. **Prepare Next Round**: Click "Prepare Next Round" to mark the winner in the database and continue to the next draw.
5. **Winner Persistence**: Winners are marked as `won: true` in the database and will remain marked even after page refresh.
6. **Reset Raffle**: When all participants have won, click "Reset Raffle" to start a new round with everyone available again.

## Winner Email Notifications

When a draw ends, the app POSTs the winner's details to the webhook in
`NEXT_PUBLIC_WINNER_WEBHOOK_URL`:

```json
{ "name": "John", "last_name": "Doe", "email": "john@example.com" }
```

An [n8n](https://n8n.io) workflow receives this and emails the winner a styled
congratulations message. The importable workflow and full setup instructions live in
[`n8n/`](./n8n/README.md).

> **CORS:** because the request comes from the browser, the n8n Webhook node must allow
> the site's origin (e.g. `https://qr.ai-know.org`) via **Options → Allowed Origins (CORS)**,
> otherwise the request is blocked by the browser.

> **Note:** `NEXT_PUBLIC_*` values are embedded in the static client bundle, so the webhook
> URL is publicly visible. The n8n webhook path acts as the only access control.

## Deployment

This project is configured for **GitHub Pages** deployment via GitHub Actions.

1.  **Push to `main` (Personal Remote)**: Push to the `main` branch of the personal repository (`git@github.com:LeonMelamud/QR-Tools.git`) to trigger the deployment workflow.
    ```bash
    git push personal main
    ```
2.  **Secrets**: The GitHub Repository Environment `github-pages` must have the following secrets configured under **Settings → Secrets and variables → Actions**:
    - `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
    - `NEXT_PUBLIC_WINNER_WEBHOOK_URL` - Webhook URL to receive winner notifications (optional)

The workflow automatically builds the Next.js app as a static export and deploys it to GitHub Pages.
