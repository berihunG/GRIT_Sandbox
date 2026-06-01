# GRIT_Sandbox
GRIT Sandbox is a GPT-powered career readiness and skills verification platform where students upload resumes and evidence, while professors, advisors, employers, and peers review skills and award OEF points. It includes role dashboards, student OEF views, resume upload, GPT agents, and admin user management for a trusted skills demo app too

# GRIT Sandbox GPT Roles + Human OEF Verification

GRIT = Gamified, Reputation-based, Individualized, Talent readiness.

This package is the updated GRIT Sandbox MVP with:

- OpenAI GPT backend through a secure Express proxy
- Resume upload from disk: `.txt`, `.pdf`, `.docx`
- Role-based login for student, professor, peer, employer, advisor, and admin
- Role-specific dashboards
- Student list and evidence review workflow
- Human-approved OEF award system
- Student self-view page for personal OEF total, role breakdown, reviewer comments, and transaction history
- OEF transaction ledger
- Admin page for user management only: view username/email, view demo password, update users, and delete users
- PostgreSQL-ready schema for production migration

## Key OEF Design

OEF is not awarded automatically by AI.

The correct logic is:

1. Student uploads or submits evidence.
2. GPT/GRIT recommends skills, gaps, and possible reputation signals.
3. Advisor/professor/employer/peer logs in. Admin is intentionally excluded from awarding OEF.
4. Reviewer selects a student from the student list.
5. Reviewer selects evidence connected to that student.
6. Reviewer evaluates quality with a rubric score.
7. Reviewer enters confidence and comment.
8. System calculates OEF using role weight and evidence weight.
9. OEF transaction is saved to the ledger.
10. Student total OEF updates from approved transactions.
11. Student logs in and views their own OEF score, role breakdown, evidence, and reviewer comments.

Formula used in this MVP:

```text
OEF = min(role max, rubric score x confidence x role weight x evidence weight)
```

Where confidence is converted from 0-100 to 0.00-1.00.

## Role Weights

```text
Employer  = 1.40, max +150 per transaction
Professor = 1.30, max +140 per transaction
Advisor   = 1.10, max +120 per transaction
Peer      = 0.60, max +60 per transaction
Admin     = cannot award OEF; user management only
Student   = 0.00, cannot self-award OEF
```

## Evidence Weights

Example evidence weights are stored in `data/students.json`:

```text
Resume claim evidence             = 0.6
Peer statement                    = 0.5
Certificate                       = 1.0
Project                           = 1.0
Professor-graded project          = 1.2
Verified internship/work evidence = 1.3
```

## Run Locally

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000
```

## GPT Configuration

Add your key to `.env`:

```env
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-5.5
PORT=3000
```

If `OPENAI_API_KEY` is missing, GRIT runs in demo fallback mode.

## Demo Accounts

Password for all accounts:

```text
demo123
```

Accounts:

```text
student@grit.edu
professor@grit.edu
peer@grit.edu
employer@grit.edu
advisor@grit.edu
admin@grit.edu
```

## Suggested Demo Flow

1. Log in as `student@grit.edu`.
2. Open AI Agents.
3. Upload a resume from disk or click Load sample evidence.
4. Run Translator, Advising, or Reputation agent.
5. Log out.
6. Log in as `advisor@grit.edu`, `professor@grit.edu`, or `employer@grit.edu`.
7. Open Award OEF.
8. Select a student ID.
9. Select evidence.
10. Enter skill, rubric score, confidence, and comment.
11. Submit OEF award.
12. Log in as the student and open My OEF Score to see role-based OEF history.
13. Log in as admin to manage users. Admin can view username/email and demo password, update users, and delete users, but cannot award OEF.

## Production Notes

The current package is an MVP/demo. For production, add:

- Real authentication and authorization
- Local JSON database using `data/users.json`, `data/students.json`, and `data/oef_transactions.json`
- File storage and virus scanning for uploads
- FERPA/privacy workflow
- Reviewer assignment rules
- OEF dispute/appeal workflow
- Admin approval queues for sensitive awards
- Hedera or other ledger anchoring after internal audit is stable

## Vercel Deployment Included

This package includes Vercel deployment files:

- `api/index.js`
- `src/app.js`
- `vercel.json`
- `.vercelignore`
- `README_VERCEL_DEPLOY.md`

Push this folder to GitHub, import it into Vercel, and set `OPENAI_API_KEY` and `OPENAI_MODEL` as environment variables.


## Local DB Edition Update

This final package intentionally does **not** use Supabase. All demo users, students, evidence, and OEF transactions are stored in local JSON files under `data/`.

Admin remains user-management only. Admin cannot award OEF. Students can view their own OEF score and the points given by professor, advisor, employer, and peer.

For Vercel deployment, only add OpenAI environment variables. Supabase variables are not required.
