# Runbook: Google OAuth setup for KarbonLens

This guide walks Andy through registering the Google OAuth client in Google Cloud Console,
configuring environment variables locally and on Netlify, and smoke-testing the sign-in flow.

## Prerequisites

- Google account with access to Google Cloud Console
- The KarbonLens repo cloned locally
- `npm run dev` able to start (T03 + T04 complete; `DATABASE_URL` set in `.env.local`)

---

## Step 1 — Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. Click the project dropdown (top left) → "New Project"
3. Name: `KarbonLens`, Location: No organisation
4. Click Create. Wait for the project to provision (~30 seconds).
5. Ensure the new project is selected in the dropdown before proceeding.

---

## Step 2 — Configure the OAuth consent screen

1. Navigate to "APIs & Services" → "OAuth consent screen"
2. User Type: **External** → Create
3. App name: `KarbonLens`
4. User support email: your Google email
5. Developer contact information: your Google email
6. Click **Save and Continue** through Scopes (add nothing extra — the defaults cover `profile` and `email`)
7. On Test Users: add your own Google email so you can test before verification
8. Click **Back to Dashboard**

---

## Step 3 — Create the OAuth 2.0 Web client

1. Navigate to "APIs & Services" → "Credentials"
2. Click "+ Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: **Web application**
4. Name: `KarbonLens Web`

### Authorised JavaScript origins

Add both:
- `http://localhost:3000`
- `https://karbonlens.netlify.app`

### Authorised redirect URIs

Add all three (add the custom domain entry when the domain is confirmed):
- `http://localhost:3000/api/auth/callback/google`
- `https://karbonlens.netlify.app/api/auth/callback/google`
- *(production custom domain TBD — add `https://<custom-domain>/api/auth/callback/google` when known)*

5. Click **Create**

The dialog shows **Your Client ID** and **Your Client Secret** — copy both now; you will need them in the next two steps.

---

## Step 4 — Set environment variables in .env.local (local dev)

In the repo root, create `.env.local` from the example file if it does not already exist:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```
GOOGLE_CLIENT_ID=<paste Client ID here>
GOOGLE_CLIENT_SECRET=<paste Client Secret here>
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000
```

**Never commit `.env.local`.** It is listed in `.gitignore`.

---

## Step 5 — Set environment variables on Netlify (production)

Do this **at the same time** as Step 4 — the GCP OAuth client already lists the Netlify redirect URI, so the production env vars must match or OAuth callbacks will fail on Netlify.

1. Go to the Netlify dashboard → your KarbonLens site → **Site configuration** → **Environment variables**
2. Add the following variables (production context):

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | same Client ID as above |
   | `GOOGLE_CLIENT_SECRET` | same Client Secret as above |
   | `NEXTAUTH_SECRET` | same 32-byte base64 string as above |
   | `NEXTAUTH_URL` | `https://karbonlens.netlify.app` |

3. Click **Save**. Netlify will use these on the next deploy.

> **Note:** `NEXTAUTH_URL` must be `https://karbonlens.netlify.app` on Netlify (not `http://localhost:3000`). The local `.env.local` and the Netlify env var have different values — this is expected and correct.

---

## Step 6 — Smoke test (local dev)

```bash
npm run dev
```

Navigate to `http://localhost:3000` and click **Sign in with Google**.

Complete the consent flow in the browser. You should be redirected back to the app with your name/avatar visible in the top nav.

### Smoke test checklist

- [ ] Redirected back to app after consent — no `?error=` in the URL
- [ ] Name and avatar visible in top nav
- [ ] Onboarding modal appears (first login)
- [ ] `SELECT * FROM users WHERE email='<your-google-email>';` returns exactly one row with `email_digest_opt_in = TRUE` and `persona IS NULL`
- [ ] `SELECT * FROM accounts WHERE provider = 'google';` returns a row with non-null `provider_account_id`
- [ ] `SELECT * FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='<your-email>');` returns a row with `expires > NOW()`
- [ ] Navigating to `http://localhost:3000/prices` while signed out redirects to `/?signin=1`
- [ ] Navigating to `http://localhost:3000/prices` while signed in returns HTTP 200
- [ ] Clicking "Sign out" clears the avatar; navigating to `/prices` redirects to `/?signin=1`
