# n8n Workflows

Automation workflows for the raffle app, exported as importable n8n JSON.

## Raffle Winner Email (`raffle-winner-email.n8n.json`)

Sends a styled congratulations email to a raffle winner.

**Flow:** `Webhook (POST)` → `Has Email?` (IF guard) → `Send Winner Email` (Gmail, HTML)

### Trigger payload

The raffle app POSTs this JSON when a spin ends (`src/app/raffle/page.tsx` → `handleSpinEnd`):

```json
{
  "name": "John",
  "last_name": "Doe",
  "email": "john@example.com"
}
```

n8n nests the body under `body`, so fields are referenced as `{{ $json.body.name }}`,
`{{ $json.body.last_name }}`, `{{ $json.body.email }}`. If your n8n version flattens the
body, drop the `.body` (e.g. `{{ $json.email }}`).

### Webhook URL

The workflow uses the fixed path `7a8b5663-0f8b-46af-820f-6ce52a0113bc`, matching the app's
`NEXT_PUBLIC_WINNER_WEBHOOK_URL`:

- **Production:** `https://<your-n8n-host>/webhook/7a8b5663-0f8b-46af-820f-6ce52a0113bc`
- **Test:** `https://<your-n8n-host>/webhook-test/7a8b5663-0f8b-46af-820f-6ce52a0113bc`

The app reads this URL from `NEXT_PUBLIC_WINNER_WEBHOOK_URL` (`.env.local` for dev, GitHub
Actions secret for the GitHub Pages build).

## Import

1. In n8n: **New workflow** → top-right **⋮** → **Import from File** → select the JSON.
2. Open the **Send Winner Email** node → set its **Gmail OAuth2** credential
   (credentials are intentionally not stored in the export).
3. **Save**, then toggle the workflow **Active**.

## Test

```bash
curl -X POST https://<your-n8n-host>/webhook-test/7a8b5663-0f8b-46af-820f-6ce52a0113bc \
  -H 'Content-Type: application/json' \
  -d '{"name":"Leon","last_name":"Melamud","email":"you@example.com"}'
```

Use `/webhook/` instead of `/webhook-test/` once the workflow is Active.
