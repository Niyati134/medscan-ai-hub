# MedScan AI Hub

Build a modern AI-powered healthcare web app called MedScan AI.

Pages required:

1. Landing page

2. Login page

3. Signup page

4. Dashboard page

5. Prescription upload page

6. Scan results page

7. Chatbot assistant page

8. User profile page

9. Scan history page

Features:

- Beautiful modern UI

- Medical healthcare theme

- Dark/light mode

- Mobile responsive

- Sidebar navigation

- Upload prescription image

- Drag and drop upload box

- AI scanning animation

- Medicine cards showing:

  - medicine name

  - uses

  - side effects

  - price

  - equivalent medicines

- Floating AI chatbot

- Search bar

- Loading animations

- Modern cards and tables

- Tailwind CSS

- React + TypeScript

- Use shadcn/ui components

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0e3bcd2c-25ed-4bcb-8259-557a9eeb7461).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Local setup (Supabase + Gemini)

1. `npm install`
2. Copy `.env.example` to `.env` and fill in your Supabase and Gemini values (`.env` is git-ignored).
3. Open the Supabase **SQL Editor**, paste `supabase/migrations/20261018000000_reconcile_schema_with_code.sql` and run it.
   It is idempotent (safe to re-run) and never drops data. It creates/repairs every table, RLS policy and the private
   `prescriptions` storage bucket that the code expects.
4. `npm run dev` → http://localhost:8080/

AI calls use `gemini-3.8-flash` with low reasoning effort and fall back to `gemini-3.6-flash` on overload/quota/timeouts.
Override with `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` (see `.env.example`). Server logs show per-request timing and token
usage as `[ai] ok model=... ms=...` lines, which is the first place to look if scans feel slow.
