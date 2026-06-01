# Deploy GRIT to Vercel

This package is ready to push to GitHub and import into Vercel.

## What is included

- `public/` static frontend
- `src/app.js` shared Express app
- `api/index.js` Vercel serverless entry point
- `vercel.json` routes all `/api/*` requests to the Express API
- `package.json` deployment scripts and dependencies
- `.vercelignore` so secrets and local uploads are not pushed/deployed

## Before pushing to GitHub

Do not commit `.env` or `node_modules`.

```bash
npm install
npm run check
npm start
```

Open:

```text
http://localhost:3000
```

## Push to GitHub

```bash
git init
git add .
git commit -m "Prepare GRIT for Vercel deployment"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Vercel settings

Import the GitHub repository into Vercel.

Use:

```text
Framework Preset: Other
Build Command: npm run build
Output Directory: public
Install Command: npm install
```

Add environment variables in Vercel:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
```

The app will run in demo mode if `OPENAI_API_KEY` is not set.

## Notes

The demo stores users/OEF in JSON files. On Vercel serverless, file writes may not persist permanently. This is fine for demo testing, but production should use Supabase, Neon, Firebase, or another database for users, resumes, and OEF transactions.
