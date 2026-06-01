require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = process.env.VERCEL ? '/tmp/grit_uploads' : path.join(ROOT_DIR, 'uploads');
const USERS_PATH = path.join(DATA_DIR, 'users.json');
const STUDENTS_PATH = path.join(DATA_DIR, 'students.json');
const OEF_TX_PATH = path.join(DATA_DIR, 'oef_transactions.json');
const MAX_FILE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'missing-key' });
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only .txt, .pdf, and .docx resumes are supported.'));
    cb(null, true);
  }
});

app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

const AGENTS = {
  TRANSLATOR: 'Convert resume evidence into employer-readable capability language. Focus on achievements, tools, skills, and business value.',
  TALENT: 'Analyze demand fit for the target role. Identify role match, competitive strengths, and market-facing gaps.',
  ADVISING: 'Identify learner gaps and next advising actions. Be practical, specific, and supportive.',
  CURRICULUM: 'Create an individualized learning path with modules, practice tasks, and assessment evidence.',
  GENERATOR: 'Generate project or innovation ideas that would demonstrate the target capability.',
  DISCRIMINATOR: 'Critique the proposed project or plan. Identify risks, weaknesses, assumptions, and improvements.',
  REPUTATION: 'Evaluate evidence for verification. Recommend OEF score, verifier confidence, and next evidence needed. AI recommends only; human reviewers approve final OEF.'
};

const DEMO_RESPONSES = {
  TRANSLATOR: 'Market Translation:\n- Database design experience becomes: relational modeling, SQL schema design, and data integrity implementation.\n- AI research becomes: applied machine learning, retrieval design, and evidence-based experimentation.\n- Academic projects become: portfolio evidence for junior data, software, or database roles.',
  TALENT: 'Talent Fit:\nTarget role fit is moderate to strong. Strong evidence: SQL, database design, research discipline, and project execution. Gaps: cloud database administration, backup/recovery, monitoring, and production security practices.',
  ADVISING: 'Advising Plan:\n1. Strengthen SQL performance tuning.\n2. Add one PostgreSQL or MySQL administration project.\n3. Document evidence with screenshots, schema, ERD, and reflections.\n4. Ask professor/advisor/employer verifier for feedback.',
  CURRICULUM: 'Individual Learning Path:\nWeek 1: Advanced SQL and normalization review.\nWeek 2: PostgreSQL administration and backups.\nWeek 3: Cloud database deployment.\nWeek 4: Capstone evidence package and verification request.',
  GENERATOR: 'Project Idea:\nBuild a Student Skill Evidence Registry that stores resumes, projects, verifier comments, and OEF reputation events. Demonstrate database design, role-based access, and reporting dashboards.',
  DISCRIMINATOR: 'Critique:\nThe idea is strong but needs a clear MVP boundary. Risks include privacy, weak verification quality, and over-complex blockchain integration. Start with simulated tokens and audit logs before real Hedera integration.',
  REPUTATION: 'Verification Simulation:\nAI can recommend a skill, score range, and evidence gaps. Final OEF should be awarded only by a human reviewer selecting a student, evidence item, skill, rubric score, confidence, and comment.'
};

const ROLE_WEIGHTS = {
  employer: 1.40,
  professor: 1.30,
  advisor: 1.10,
  peer: 0.60,
  student: 0
};

const ROLE_LIMITS = {
  employer: { maxAward: 150, skills: ['Workplace Performance', 'Professional Communication', 'Teamwork', 'Technical Skill', 'Industry Readiness'] },
  professor: { maxAward: 140, skills: ['Course Project Quality', 'Research Quality', 'Technical Skill', 'Problem Solving', 'Academic Communication'] },
  advisor: { maxAward: 120, skills: ['Career Readiness', 'Resume Quality', 'Learning Progress', 'Interview Readiness', 'Professional Plan'] },
  peer: { maxAward: 60, skills: ['Teamwork', 'Collaboration', 'Communication', 'Contribution', 'Reliability'] }
};

function readJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readUsers() { return readJson(USERS_PATH, []); }
function readStudents() { return readJson(STUDENTS_PATH, []); }
function readOefTransactions() { return readJson(OEF_TX_PATH, []); }

function publicUser(user) {
  return { email: user.email, role: user.role, name: user.name, studentId: user.studentId || null };
}

function adminUser(user) {
  return { email: user.email, password: user.password, role: user.role, name: user.name, studentId: user.studentId || '' };
}

function safeSummary(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 250);
}

function clamp(num, min, max) {
  const value = Number(num);
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function calculateOef({ rubricScore, confidence, role, evidenceWeight }) {
  const score = clamp(rubricScore, 0, 100);
  const conf = clamp(confidence, 0, 100) / 100;
  const roleWeight = ROLE_WEIGHTS[role] || 0;
  const evWeight = clamp(evidenceWeight, 0.1, 2.0);
  const raw = score * conf * roleWeight * evWeight;
  const maxAward = ROLE_LIMITS[role]?.maxAward || 50;
  return Math.round(Math.min(maxAward, raw));
}

function getStudentOefTotal(studentId) {
  return readOefTransactions()
    .filter(tx => tx.studentId === studentId && tx.status === 'approved')
    .reduce((sum, tx) => sum + Number(tx.oefPoints || 0), 0);
}

function hydrateStudent(student) {
  return { ...student, oefTotal: getStudentOefTotal(student.studentId) };
}

async function extractResumeText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.txt') return fs.readFileSync(file.path, 'utf8');
  if (ext === '.pdf') {
    const data = await pdfParse(fs.readFileSync(file.path));
    return data.text || '';
  }
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: file.path });
    return result.value || '';
  }
  throw new Error('Unsupported resume file type.');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: 'openai', model: MODEL, demoMode: !process.env.OPENAI_API_KEY });
});

app.post('/api/login', (req, res) => {
  const { email, password, role } = req.body || {};
  const users = readUsers();
  const user = users.find(u => u.email === email && u.password === password && u.role === role);
  if (!user) return res.status(401).json({ error: 'Invalid demo login for selected role.' });
  res.json({ user: publicUser(user), token: Buffer.from(`${user.email}:${Date.now()}`).toString('base64') });
});

app.get('/api/admin/users', (req, res) => {
  res.json({ users: readUsers().map(adminUser) });
});

app.post('/api/admin/users', (req, res) => {
  const { name, email, password, role, studentId } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, and role are required.' });
  const allowedRoles = ['student', 'professor', 'peer', 'employer', 'advisor', 'admin'];
  if (!allowedRoles.includes(String(role).toLowerCase())) return res.status(400).json({ error: 'Invalid role.' });
  const users = readUsers();
  if (users.some(u => u.email === email)) return res.status(409).json({ error: 'A user with this email already exists.' });
  const user = { name, email, password, role: String(role).toLowerCase(), studentId: studentId || '' };
  users.push(user);
  writeJson(USERS_PATH, users);
  res.json({ user: adminUser(user), users: users.map(adminUser) });
});

app.put('/api/admin/users/:email', (req, res) => {
  const emailParam = decodeURIComponent(req.params.email);
  const { name, email, password, role, studentId } = req.body || {};
  const allowedRoles = ['student', 'professor', 'peer', 'employer', 'advisor', 'admin'];
  if (role && !allowedRoles.includes(String(role).toLowerCase())) return res.status(400).json({ error: 'Invalid role.' });
  const users = readUsers();
  const index = users.findIndex(u => u.email === emailParam);
  if (index < 0) return res.status(404).json({ error: 'User not found.' });
  if (email && email !== emailParam && users.some(u => u.email === email)) return res.status(409).json({ error: 'Another user already has this email.' });
  users[index] = {
    ...users[index],
    name: name || users[index].name,
    email: email || users[index].email,
    password: password || users[index].password,
    role: role ? String(role).toLowerCase() : users[index].role,
    studentId: studentId !== undefined ? studentId : (users[index].studentId || '')
  };
  writeJson(USERS_PATH, users);
  res.json({ user: adminUser(users[index]), users: users.map(adminUser) });
});

app.delete('/api/admin/users/:email', (req, res) => {
  const emailParam = decodeURIComponent(req.params.email);
  const users = readUsers();
  const next = users.filter(u => u.email !== emailParam);
  if (next.length === users.length) return res.status(404).json({ error: 'User not found.' });
  writeJson(USERS_PATH, next);
  res.json({ deleted: emailParam, users: next.map(adminUser) });
});

app.get('/api/students', (req, res) => {
  res.json({ students: readStudents().map(hydrateStudent) });
});

app.get('/api/oef/transactions', (req, res) => {
  const { studentId } = req.query || {};
  let transactions = readOefTransactions();
  if (studentId) transactions = transactions.filter(tx => tx.studentId === studentId);
  res.json({ transactions: transactions.slice().reverse() });
});

app.get('/api/oef/student/:studentId', (req, res) => {
  const studentId = req.params.studentId;
  const students = readStudents();
  const student = students.find(s => s.studentId === studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const transactions = readOefTransactions().filter(tx => tx.studentId === studentId && tx.status === 'approved');
  const total = transactions.reduce((sum, tx) => sum + Number(tx.oefPoints || 0), 0);
  const byRole = transactions.reduce((acc, tx) => {
    acc[tx.verifierRole] = (acc[tx.verifierRole] || 0) + Number(tx.oefPoints || 0);
    return acc;
  }, {});
  res.json({ student: hydrateStudent(student), total, byRole, transactions: transactions.slice().reverse() });
});

app.get('/api/oef/role-rules', (req, res) => {
  res.json({ roleWeights: ROLE_WEIGHTS, roleLimits: ROLE_LIMITS });
});

app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No resume file uploaded.' });
    const text = await extractResumeText(req.file);
    res.json({
      filename: req.file.originalname,
      sizeBytes: req.file.size,
      text,
      summary: safeSummary(text)
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Resume upload failed.' });
  } finally {
    if (req.file && req.file.path) fs.promises.unlink(req.file.path).catch(() => {});
  }
});

app.post('/api/agent', async (req, res) => {
  const { agent = 'TRANSLATOR', resume = '', goal = '', project = '', role = 'student' } = req.body || {};
  const agentKey = String(agent).toUpperCase();
  if (!AGENTS[agentKey]) return res.status(400).json({ error: 'Unknown GRIT agent.' });

  const prompt = `GRIT:${agentKey}\nRole using system: ${role}\nAgent responsibility: ${AGENTS[agentKey]}\nTarget goal: ${goal || 'Not provided'}\nResume/evidence:\n${resume || 'No resume evidence provided.'}\nProject/objective context:\n${project || 'Not provided'}\n\nReturn concise structured guidance with headings, bullets, and specific next actions. When discussing OEF, state that AI recommends and human verifiers approve.`;

  if (!process.env.OPENAI_API_KEY) {
    return res.json({ mode: 'demo', agent: agentKey, output: DEMO_RESPONSES[agentKey], promptPreview: safeSummary(prompt) });
  }

  try {
    const response = await openai.responses.create({ model: MODEL, input: prompt, max_output_tokens: 1200 });
    res.json({ mode: 'gpt', agent: agentKey, output: response.output_text || '', promptPreview: safeSummary(prompt) });
  } catch (error) {
    console.error('OpenAI API error:', error);
    res.json({ mode: 'fallback', agent: agentKey, output: DEMO_RESPONSES[agentKey], warning: error.message });
  }
});

app.post('/api/oef/award', (req, res) => {
  const {
    studentId,
    verifierName = 'Demo verifier',
    verifierEmail = '',
    verifierRole = 'peer',
    evidenceId,
    skillCategory = 'General Skill',
    skillName = 'Unspecified skill',
    rubricScore = 80,
    confidence = 80,
    evidenceWeight,
    comment = ''
  } = req.body || {};

  const role = String(verifierRole || '').toLowerCase();
  if (role === 'student') return res.status(403).json({ error: 'Students cannot award OEF to themselves.' });
  if (role === 'admin') return res.status(403).json({ error: 'Admin cannot award OEF. Admin can only manage users and audit records.' });
  if (!ROLE_WEIGHTS[role]) return res.status(400).json({ error: 'Unknown verifier role.' });

  const students = readStudents();
  const student = students.find(s => s.studentId === studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const evidence = student.evidence.find(e => e.evidenceId === evidenceId) || student.evidence[0];
  const evWeight = Number(evidenceWeight || evidence?.weight || 1.0);
  const oefPoints = calculateOef({ rubricScore, confidence, role, evidenceWeight: evWeight });

  const tx = {
    txId: `SIM-OEF-${Date.now()}`,
    status: 'approved',
    studentId: student.studentId,
    studentName: student.name,
    careerGoal: student.careerGoal,
    verifierName,
    verifierEmail,
    verifierRole: role,
    evidenceId: evidence?.evidenceId || 'manual',
    evidenceTitle: evidence?.title || 'Manual evidence',
    evidenceWeight: evWeight,
    skillCategory,
    skillName,
    rubricScore: clamp(rubricScore, 0, 100),
    confidence: clamp(confidence, 0, 100),
    roleWeight: ROLE_WEIGHTS[role],
    oefPoints,
    comment,
    createdAt: new Date().toISOString()
  };

  const transactions = readOefTransactions();
  transactions.push(tx);
  writeJson(OEF_TX_PATH, transactions);

  res.json({
    transaction: tx,
    student: hydrateStudent(student),
    formula: 'OEF = min(role max, rubric score x confidence x role weight x evidence weight)',
    message: `${student.name} received +${oefPoints} OEF for ${skillName}, verified by ${role}.`
  });
});

// Backward-compatible route kept for earlier MVP clients.
app.post('/api/verify', (req, res) => {
  res.status(410).json({ error: 'Use /api/oef/award. The OEF workflow now requires selecting a student and evidence item before awarding points.' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`GRIT Sandbox GPT Roles + OEF workflow running at http://localhost:${PORT}`));
}
