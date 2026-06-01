-- GRIT Sandbox beta logical schema
-- Current MVP uses JSON files for demo persistence. This schema is for PostgreSQL migration.

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(40) NOT NULL CHECK (role IN ('student','professor','peer','employer','advisor','admin')),
  student_id VARCHAR(40),
  hedera_account VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE students (
  student_id VARCHAR(40) PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  career_goal TEXT,
  program TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evidence_items (
  evidence_id VARCHAR(40) PRIMARY KEY,
  student_id VARCHAR(40) REFERENCES students(student_id),
  title VARCHAR(255) NOT NULL,
  evidence_type VARCHAR(80) NOT NULL,
  evidence_weight NUMERIC(4,2) DEFAULT 1.00,
  summary TEXT,
  source_url TEXT,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE resumes (
  resume_id SERIAL PRIMARY KEY,
  student_id VARCHAR(40) REFERENCES students(student_id),
  original_filename VARCHAR(255),
  extracted_text TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_runs (
  run_id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(user_id),
  agent_name VARCHAR(60) NOT NULL,
  target_goal TEXT,
  input_summary TEXT,
  output_text TEXT,
  mode VARCHAR(30) DEFAULT 'demo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE oef_transactions (
  tx_id VARCHAR(120) PRIMARY KEY,
  status VARCHAR(30) DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','adjusted')),
  student_id VARCHAR(40) REFERENCES students(student_id),
  verifier_id INTEGER REFERENCES users(user_id),
  verifier_role VARCHAR(40) NOT NULL CHECK (verifier_role IN ('professor','peer','employer','advisor')), -- admin cannot award OEF
  evidence_id VARCHAR(40) REFERENCES evidence_items(evidence_id),
  skill_category VARCHAR(160) NOT NULL,
  skill_name VARCHAR(160) NOT NULL,
  rubric_score INTEGER CHECK (rubric_score BETWEEN 0 AND 100),
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  role_weight NUMERIC(4,2) NOT NULL,
  evidence_weight NUMERIC(4,2) NOT NULL,
  oef_points INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW student_oef_totals AS
SELECT student_id, COALESCE(SUM(oef_points),0) AS oef_total
FROM oef_transactions
WHERE status = 'approved'
GROUP BY student_id;
