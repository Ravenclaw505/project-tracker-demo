# Deploying to Vercel

The app is ready to deploy. Everything below needs your Vercel account, so these
are the steps only you can run — the code side is done.

---

## 1. Environment variables

Set these four in Vercel (**Project → Settings → Environment Variables**), for
Production, Preview and Development:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | the same Neon connection string that is in your local `.env.local` |
| `SESSION_SECRET` | a fresh random string — see below |
| `HEAD_EMAIL` | `sadman.anwar@pathao.com` |
| `ALLOWED_EMAIL_DOMAIN` | `pathao.com` |

Generate the production secret and paste the output straight into Vercel:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use a **different** value from the local one so a development session cannot be
replayed against the live site. Never commit either — this file is in the
repository, so no real secret belongs in it.

The Neon database is already cloud-hosted, so the deployment talks to the same
data you have been using. Nothing to migrate.

---

## 2. Deploy — pick one route

### Route A · GitHub (recommended)

Auto-deploys every push, gives you preview URLs for branches.

```bash
git remote add origin https://github.com/<you>/project-tracker.git
git branch -M main
git push -u origin main
```

Then on vercel.com: **Add New → Project → Import** that repository. Vercel
detects Next.js on its own — no build settings to change. Add the four variables
from step 1 before the first deploy.

### Route B · Vercel CLI (no GitHub needed)

```bash
npx vercel login
npx vercel --prod
```

The CLI asks a few questions (scope, project name, directory — accept the
defaults) and uploads straight from this folder.

---

## 3. First run against the live site

1. Open the deployment URL.
2. Call the setup endpoint once so any missing columns are created:
   `POST https://<your-app>.vercel.app/api/setup`
   (or open **Settings → Run setup** in the app once you are signed in).
3. Sign in as `sadman.anwar@pathao.com` — the account already exists in the
   database and is already head.

---

## 4. Custom domain

Vercel gives you `<project>.vercel.app` immediately. For a real domain:

1. **Project → Settings → Domains → Add**, enter e.g. `tracker.pathao.com`.
2. Vercel shows the DNS record to create — usually a `CNAME` for a subdomain
   pointing at `cname.vercel-dns.com`.
3. Whoever administers `pathao.com` DNS adds that record. HTTPS is issued
   automatically once it resolves.

A subdomain is far easier to get approved internally than touching the apex
domain, and needs no changes here.

---

## 5. Before you share the link

- **Everyone who registers is locked out until you approve them**, so the link
  being public does not mean the data is.
- Sign-in is throttled: 8 wrong passwords locks that account for 15 minutes.
- Sessions are HTTPS-only cookies in production.
- There is still **no password reset** — if someone forgets theirs, the only
  route today is to remove the account so they can register again.
- Consider putting it behind the company VPN or Vercel's password protection
  (Pro plan) if you would rather it were not reachable from the open internet
  at all.
