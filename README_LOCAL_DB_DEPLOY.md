# GRIT Sandbox - Local DB Edition

This package uses local JSON files as the database. Supabase has been removed.

## Local DB files

The app stores demo data in:

- `data/users.json`
- `data/students.json`
- `data/oef_transactions.json`

## Roles

- Student: can view only their own OEF score and role-based OEF history.
- Professor: can select a student/evidence and award OEF.
- Advisor: can select a student/evidence and award OEF.
- Employer: can select a student/evidence and award OEF.
- Peer: can select a student/evidence and award OEF.
- Admin: cannot award OEF; admin only manages users.

## Admin permissions

Admin can:

- View username/email/password/role/student ID
- Create users
- Update users
- Delete users
- Link a student user account to a student ID

Admin cannot:

- Award OEF
- Give student scores

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

## Demo logins

Password for all demo accounts:

```text
demo123
```

Example accounts:

```text
student@grit.edu
professor@grit.edu
peer@grit.edu
employer@grit.edu
advisor@grit.edu
admin@grit.edu
```

## Vercel deployment note

This package is Vercel-ready, but local JSON storage is best for local demos. On Vercel/serverless deployments, file writes may not persist permanently across redeploys or serverless restarts. That is why Supabase/PostgreSQL should be added later for production.

For now, you can deploy the prototype to Vercel and use it as a demo. For real student records, connect a permanent database later.

## Vercel environment variables

Only OpenAI variables are needed:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.5
```

No Supabase variables are required.
