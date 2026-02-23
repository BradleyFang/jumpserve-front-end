# Jumpserve Front End

Starter app using:

- Next.js `16.1.6`
- TailwindCSS `4`
- Supabase client libraries (`@supabase/supabase-js` + `@supabase/ssr`)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env.local
```

3. Fill in your Supabase values in `.env.local`.

4. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Supabase Helpers

- Browser client: `lib/supabase/client.ts`
- Server client: `lib/supabase/server.ts`
