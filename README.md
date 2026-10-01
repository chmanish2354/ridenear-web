# RideNear Web

React + Vite frontend for DRN(DiscoverRideNear).

The Section 6 demo script, demo account, and `gpt-4o-mini` requirement live in the API README: [../ridenear-api/README.md](../ridenear-api/README.md). Hosting is not done yet. Deployment notes are in [../ridenear-api/docs/deployment.md](../ridenear-api/docs/deployment.md).

## Environment

Copy `.env.example` to `.env`. Both values are the API origin. Do not commit `.env`.

| Variable | Local value | Role |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | Nest REST origin (`/api`) |
| `VITE_WS_URL` | `http://localhost:3000` | Socket.IO origin (same API origin, path `/realtime`) |

Vite reads these at build and dev-server start. Change them, then restart `npm run dev`.

## Local run

Start the API and the AI service first, then:

```bash
cp .env.example .env
npm install
npm run dev
```

On Windows PowerShell, copy the env file with `Copy-Item .env.example .env`.

Open http://localhost:5173. With no session, the app sends you to `/login`. Sign in with the demo account named in the API README, then follow Section 6 there.
