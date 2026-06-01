const roles = [
  { key:'student', icon:'🎓', title:'Student', email:'student@grit.edu' },
  { key:'professor', icon:'🧑‍🏫', title:'Professor', email:'professor@grit.edu' },
  { key:'peer', icon:'🤝', title:'Peer', email:'peer@grit.edu' },
  { key:'employer', icon:'🏢', title:'Employer', email:'employer@grit.edu' },
  { key:'advisor', icon:'🧭', title:'Advisor', email:'advisor@grit.edu' },
  { key:'admin', icon:'🛠️', title:'Admin', email:'admin@grit.edu' }
];
const agents = ['TRANSLATOR','TALENT','ADVISING','CURRICULUM','GENERATOR','DISCRIMINATOR','REPUTATION'];
const reviewerRoles = ['professor','peer','employer','advisor'];
let selectedRole = 'student';
let currentUser = null;
let students = [];
let roleRules = { roleWeights:{}, roleLimits:{} };
let myOef = { transactions: [], byRole: {}, total: 0 };
let adminUsers = [];
const $ = id => document.getElementById(id);
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function money(n){ return Number(n || 0).toLocaleString(); }

function initRoles(){
  $('roleGrid').innerHTML = roles.map(r => `<div class="role-card ${r.key===selectedRole?'active':''}" data-role="${r.key}"><div style="font-size:28px">${r.icon}</div><strong>${r.title}</strong><small>${r.email}</small></div>`).join('');
  document.querySelectorAll('.role-card').forEach(card => card.onclick = () => selectRole(card.dataset.role));
}
function selectRole(role){
  selectedRole = role;
  $('selectedRole').value = role;
  const found = roles.find(r => r.key === role);
  $('email').value = found.email;
  initRoles();
}
function initAgents(){
  $('agentGrid').innerHTML = agents.map(a => `<button data-agent="${a}">${a.replace('_',' ')}</button>`).join('');
  document.querySelectorAll('[data-agent]').forEach(btn => btn.onclick = () => runAgent(btn.dataset.agent));
}
function roleContent(role){
  const map = {
    student:[['View my OEF','See your total OEF score, role breakdown, evidence, reviewer comments, and transaction history.'],['Submit evidence','Upload resume, projects, certificates, and reflections.'],['Request verification','Ask a professor, advisor, employer, or peer to verify evidence.']],
    professor:[['Select student','Open a student profile and review course/research evidence.'],['Score skill quality','Use rubric score and confidence to verify academic or technical skill.'],['Award OEF','Submit an evidence-linked OEF transaction.']],
    peer:[['Assigned teammate review','Review collaboration artifacts or team contribution.'],['Low-weight trust signal','Verify teamwork, communication, contribution, or reliability.'],['Submit comments','Peer OEF is useful but intentionally lower weight.']],
    employer:[['Talent review','Assess workplace capability and industry readiness.'],['High-value verification','Employer OEF carries the highest role weight.'],['Evidence required','Link award to internship, job, project, or interview evidence.']],
    advisor:[['Student list','Select advisee by name or ID.'],['Career quality check','Evaluate resume quality, learning progress, interview readiness, and career fit.'],['Guide next actions','Award OEF and leave improvement comments.']],
    admin:[['Manage users','View username/email, password, role, and linked student ID.'],['Update or delete users','Edit demo user access or remove users.'],['No OEF awarding','Admin can audit records but cannot give OEF points.']]
  };
  return map[role] || map.student;
}
function renderDashboard(){
  $('dashTitle').textContent = `${currentUser.role.toUpperCase()} Dashboard`;
  $('dashSubtitle').textContent = currentUser.name;
  $('roleEyebrow').textContent = `${currentUser.role} workspace`;
  $('roleHeading').textContent = `Welcome, ${currentUser.name}`;
  $('sessionPill').textContent = `${currentUser.name} · ${currentUser.role}`;
  $('roleCards').innerHTML = roleContent(currentUser.role).map(c => `<div class="mini-card"><h3>${esc(c[0])}</h3><p>${esc(c[1])}</p></div>`).join('');
  document.querySelectorAll('.admin-only').forEach(x => x.style.display = currentUser.role === 'admin' ? 'block' : 'none');
  document.querySelectorAll('.reviewer-only').forEach(x => x.style.display = reviewerRoles.includes(currentUser.role) ? 'block' : 'none');
  document.querySelectorAll('.student-only').forEach(x => x.style.display = currentUser.role === 'student' ? 'block' : 'none');
  $('oefBalanceLabel').textContent = currentUser.role === 'student' ? 'My OEF' : 'Selected student OEF';
}
async function login(e){
  e.preventDefault();
  const res = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value,role:selectedRole})});
  const data = await res.json();
  if(!res.ok) return alert(data.error || 'Login failed');
  currentUser = data.user;
  $('loginPage').classList.add('hidden');
  $('appPage').classList.remove('hidden');
  renderDashboard();
  showView('dashboard');
  await refreshHealth();
  await loadRoleRules();
  await loadStudents();
  await loadLedger();
  if(currentUser.role === 'student') await loadMyOef();
  if(currentUser.role === 'admin') await loadAdmin();
}
function logout(){ currentUser=null; $('loginPage').classList.remove('hidden'); $('appPage').classList.add('hidden'); $('sessionPill').textContent='Not signed in'; }
function showView(name){
  if(name === 'oef' && !reviewerRoles.includes(currentUser?.role)) return alert('Only advisor, professor, employer, or peer can award OEF. Admin cannot award OEF.');
  if(name === 'admin' && currentUser?.role !== 'admin') return alert('Only admin can manage users.');
  if(name === 'myOef' && currentUser?.role !== 'student') return alert('Only students can view this personal OEF page.');
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  $(`${name}View`).classList.remove('hidden');
  document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  if(name === 'myOef') loadMyOef();
  if(name === 'admin') loadAdmin();
}
async function refreshHealth(){
  const res = await fetch('/api/health'); const data = await res.json();
  $('modeBadge').textContent = data.demoMode ? `Demo mode · ${data.model}` : `GPT live · ${data.model}`;
}
async function loadRoleRules(){
  const res = await fetch('/api/oef/role-rules');
  roleRules = await res.json();
  updateRoleRuleBadge();
}
function updateRoleRuleBadge(){
  const role = currentUser?.role || 'student';
  const weight = roleRules.roleWeights?.[role] ?? 0;
  const max = roleRules.roleLimits?.[role]?.maxAward ?? 0;
  if($('roleRuleBadge')) $('roleRuleBadge').textContent = reviewerRoles.includes(role) ? `${role} weight ${weight} · max +${max} OEF` : 'Admin/student cannot award OEF';
  const skillOptions = roleRules.roleLimits?.[role]?.skills || ['General Skill'];
  if($('skillCategory')) $('skillCategory').innerHTML = skillOptions.map(s => `<option>${esc(s)}</option>`).join('');
}
async function loadStudents(){
  const res = await fetch('/api/students');
  const data = await res.json();
  students = data.students || [];
  if($('studentSelect')) $('studentSelect').innerHTML = students.map(s => `<option value="${esc(s.studentId)}">${esc(s.studentId)} · ${esc(s.name)} · OEF ${money(s.oefTotal)}</option>`).join('');
  renderStudentTables();
  renderSelectedStudent();
}
function renderStudentTables(){
  if($('studentsTable')) $('studentsTable').querySelector('tbody').innerHTML = students.map(s => `<tr><td>${esc(s.studentId)}</td><td>${esc(s.name)}</td><td>${esc(s.careerGoal)}</td><td>${money(s.oefTotal)}</td></tr>`).join('');
}
function selectedStudent(){ return students.find(s => s.studentId === $('studentSelect')?.value) || students[0]; }
function selectedEvidence(student){ return student?.evidence?.find(e => e.evidenceId === $('evidenceSelect')?.value) || student?.evidence?.[0]; }
function renderSelectedStudent(){
  const s = selectedStudent();
  if(!s || !$('selectedStudentPanel')) return;
  $('evidenceSelect').innerHTML = (s.evidence || []).map(e => `<option value="${esc(e.evidenceId)}">${esc(e.title)} · weight ${esc(e.weight)}</option>`).join('');
  const ev = selectedEvidence(s);
  if(currentUser?.role !== 'student') $('oefBalance').textContent = money(s.oefTotal);
  $('selectedStudentPanel').innerHTML = `<h3>${esc(s.name)} (${esc(s.studentId)})</h3><p><strong>Career goal:</strong> ${esc(s.careerGoal)} · <strong>Program:</strong> ${esc(s.program)} · <strong>Current OEF:</strong> ${money(s.oefTotal)}</p><p><strong>Selected evidence:</strong> ${esc(ev?.title)} (${esc(ev?.type)}, weight ${esc(ev?.weight)})</p><p>${esc(ev?.summary)}</p>`;
}
async function loadMyOef(){
  if(!currentUser?.studentId){
    $('myOefSummary').innerHTML = '<p>This student login is not linked to a student ID. Ask admin to update the user and assign a student ID.</p>';
    return;
  }
  const res = await fetch(`/api/oef/student/${encodeURIComponent(currentUser.studentId)}`);
  const data = await res.json();
  if(!res.ok){ $('myOefSummary').textContent = data.error || 'Unable to load OEF.'; return; }
  myOef = data;
  $('oefBalance').textContent = money(data.total);
  const roleRows = Object.entries(data.byRole || {}).map(([role,total]) => `<tr><td>${esc(role)}</td><td>${money(total)}</td></tr>`).join('') || '<tr><td colspan="2">No approved OEF yet.</td></tr>';
  $('myOefSummary').innerHTML = `<div class="student-panel"><h3>${esc(data.student.name)} (${esc(data.student.studentId)})</h3><p><strong>Total approved OEF:</strong> ${money(data.total)}</p><p><strong>Career goal:</strong> ${esc(data.student.careerGoal)} · <strong>Program:</strong> ${esc(data.student.program)}</p></div><h3>OEF by reviewer role</h3><table><thead><tr><th>Reviewer role</th><th>OEF points</th></tr></thead><tbody>${roleRows}</tbody></table>`;
  $('myOefTable').querySelector('tbody').innerHTML = (data.transactions || []).map(tx => `<tr><td>${new Date(tx.createdAt).toLocaleString()}</td><td>${esc(tx.verifierRole)}</td><td>${esc(tx.verifierName)}</td><td>${esc(tx.skillName)}</td><td>${esc(tx.evidenceTitle)}</td><td>+${money(tx.oefPoints)}</td><td>${esc(tx.comment)}</td></tr>`).join('') || '<tr><td colspan="7">No OEF records yet.</td></tr>';
}
async function uploadResume(){
  const file = $('resumeFile').files[0];
  if(!file) return;
  const form = new FormData(); form.append('resume', file);
  $('agentOutput').textContent = 'Uploading and extracting resume text...';
  const res = await fetch('/api/upload-resume',{method:'POST',body:form});
  const data = await res.json();
  if(!res.ok) { $('agentOutput').textContent = data.error || 'Upload failed'; return; }
  $('resumeText').value = data.text;
  $('agentOutput').textContent = `Uploaded ${data.filename}\n\nSummary: ${data.summary}`;
}
async function runAgent(agent){
  $('agentOutput').textContent = `Running ${agent}...`;
  const payload = {agent,resume:$('resumeText').value,goal:$('goal').value,project:$('projectText').value,role:currentUser?.role || 'student'};
  const res = await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  $('agentOutput').textContent = `[${data.mode?.toUpperCase() || 'RESULT'}] GRIT:${data.agent}\n\n${data.output || data.error}`;
}
function oefPayload(){
  const s = selectedStudent();
  const ev = selectedEvidence(s);
  return { studentId:s.studentId, verifierName:currentUser.name, verifierEmail:currentUser.email, verifierRole:currentUser.role, evidenceId:ev.evidenceId, evidenceWeight:ev.weight, skillCategory:$('skillCategory').value, skillName:$('skillName').value, rubricScore:$('rubricScore').value, confidence:$('confidence').value, comment:$('verifyComment').value };
}
function previewOef(){
  const p = oefPayload();
  const roleWeight = roleRules.roleWeights[p.verifierRole] || 0;
  const max = roleRules.roleLimits[p.verifierRole]?.maxAward || 0;
  const estimated = Math.round(Math.min(max, Number(p.rubricScore) * (Number(p.confidence)/100) * roleWeight * Number(p.evidenceWeight)));
  $('verifyOutput').textContent = `Preview only\nStudent: ${p.studentId}\nSkill: ${p.skillName}\nRole weight: ${roleWeight}\nEvidence weight: ${p.evidenceWeight}\nRubric score: ${p.rubricScore}\nConfidence: ${p.confidence}\nEstimated OEF: +${estimated}\n\nFormula: min(role max, rubric score x confidence x role weight x evidence weight)`;
}
async function awardOef(){
  const res = await fetch('/api/oef/award',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(oefPayload())});
  const data = await res.json();
  if(!res.ok){ $('verifyOutput').textContent = data.error || 'OEF award failed'; return; }
  $('verifyOutput').textContent = JSON.stringify(data,null,2);
  await loadStudents(); await loadLedger();
}
async function loadLedger(){
  const res = await fetch('/api/oef/transactions');
  const data = await res.json();
  const rows = data.transactions || [];
  $('ledgerTable').querySelector('tbody').innerHTML = rows.map(tx => `<tr><td>${new Date(tx.createdAt).toLocaleString()}</td><td>${esc(tx.studentName)}</td><td>${esc(tx.verifierRole)}</td><td>${esc(tx.skillName)}</td><td>${esc(tx.evidenceTitle)}</td><td>+${money(tx.oefPoints)}</td></tr>`).join('') || '<tr><td colspan="6">No OEF transactions yet.</td></tr>';
}
function adminPayload(){ return { name:$('adminName').value, email:$('adminEmail').value, password:$('adminPassword').value, role:$('adminRole').value, studentId:$('adminStudentId').value }; }
function fillAdminForm(email){
  const u = adminUsers.find(x => x.email === email); if(!u) return;
  $('adminOriginalEmail').value = u.email; $('adminName').value = u.name; $('adminEmail').value = u.email; $('adminPassword').value = u.password; $('adminRole').value = u.role; $('adminStudentId').value = u.studentId || '';
  $('adminUserMessage').textContent = `Editing ${u.email}`;
}
async function loadAdmin(){
  const res = await fetch('/api/admin/users'); const data = await res.json();
  adminUsers = data.users || [];
  const tbody = $('usersTable').querySelector('tbody');
  tbody.innerHTML = adminUsers.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><code>${esc(u.password)}</code></td><td>${esc(u.role)}</td><td>${esc(u.studentId || '')}</td><td><button class="ghost small" onclick="fillAdminForm('${esc(u.email)}')">Edit</button><button class="danger small" onclick="deleteUser('${esc(u.email)}')">Delete</button></td></tr>`).join('');
  await loadStudents(); await loadLedger();
}
async function saveUser(){
  const original = $('adminOriginalEmail').value;
  const payload = adminPayload();
  const url = original ? `/api/admin/users/${encodeURIComponent(original)}` : '/api/admin/users';
  const method = original ? 'PUT' : 'POST';
  const res = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  $('adminUserMessage').textContent = res.ok ? 'User saved.' : (data.error || 'User save failed.');
  if(res.ok){ clearAdminForm(); await loadAdmin(); }
}
async function deleteUser(email){
  if(!confirm(`Delete user ${email}?`)) return;
  const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`,{method:'DELETE'});
  const data = await res.json();
  $('adminUserMessage').textContent = res.ok ? `Deleted ${email}.` : (data.error || 'Delete failed.');
  await loadAdmin();
}
function clearAdminForm(){ $('adminOriginalEmail').value=''; $('adminName').value=''; $('adminEmail').value=''; $('adminPassword').value='demo123'; $('adminRole').value='student'; $('adminStudentId').value=''; }
function loadSample(){
  $('goal').value = 'Database Administrator';
  $('resumeText').value = 'Berihun Getnet: Java, SQL, database design, AI research, Amharic IR GPT query expansion, document indexing, NLP preprocessing, evaluation with precision/recall/F1, project presentation and prototype design.';
  $('projectText').value = 'Build a database-backed evidence registry for student capability verification.';
}

document.addEventListener('DOMContentLoaded', () => {
  initRoles(); initAgents(); selectRole('student');
  $('fillDemo').onclick = () => selectRole(selectedRole);
  $('loginForm').onsubmit = login;
  $('logout').onclick = logout;
  document.querySelectorAll('.nav').forEach(b => b.onclick = () => showView(b.dataset.view));
  $('resumeFile').onchange = uploadResume;
  $('previewOefBtn').onclick = previewOef;
  $('awardOefBtn').onclick = awardOef;
  $('refreshAdmin').onclick = loadAdmin;
  $('refreshLedger').onclick = loadLedger;
  $('refreshMyOef').onclick = loadMyOef;
  $('saveUserBtn').onclick = saveUser;
  $('clearUserBtn').onclick = clearAdminForm;
  $('loadSample').onclick = loadSample;
  $('studentSelect').onchange = renderSelectedStudent;
  $('evidenceSelect').onchange = renderSelectedStudent;
});
