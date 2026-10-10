import { firebaseConfig, COACH_EMAIL, qcmConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, initializeFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection,
  onSnapshot, query, where, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ---------- Utilitaires ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => { try { const x = new URL(String(u || '').trim()); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; } catch { return ''; } };
const fmtDate = (d) => { if (!d) return ''; const [y, m, j] = String(d).split('-'); return (y && m && j) ? `${j}/${m}/${y}` : esc(d); };
const todayISO = () => new Date().toISOString().slice(0, 10);

function showToast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(showToast._t); showToast._t = setTimeout(() => { t.hidden = true; }, 2600);
}
function openModal(html) { $('modal').innerHTML = html; $('modal-backdrop').hidden = false; }
function closeModal() { $('modal-backdrop').hidden = true; $('modal').innerHTML = ''; }

/* Vidéo : on ne construit l'iframe qu'à partir d'URL reconnues (YouTube, Drive, Vimeo) */
function embedFromUrl(raw) {
  const url = safeUrl(raw);
  if (!url) return '';
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  let src = '';
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1);
    if (/^[\w-]{6,20}$/.test(id)) src = `https://www.youtube-nocookie.com/embed/${id}`;
  } else if (host === 'youtube.com' || host === 'm.youtube.com') {
    let id = u.searchParams.get('v');
    if (!id) { const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,20})/); if (m) id = m[1]; }
    if (id && /^[\w-]{6,20}$/.test(id)) src = `https://www.youtube-nocookie.com/embed/${id}`;
  } else if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/) || null;
    const id = m ? m[1] : u.searchParams.get('id');
    if (id && /^[\w-]+$/.test(id)) src = `https://drive.google.com/file/d/${id}/preview`;
  } else if (host === 'vimeo.com') {
    const m = u.pathname.match(/\/(\d+)/);
    if (m) src = `https://player.vimeo.com/video/${m[1]}`;
  }
  if (!src) return '';
  return `<div class="video-wrap"><iframe src="${esc(src)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

/* ---------- Firebase ---------- */
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('COLLE_');
let auth = null, db = null, qdb = null;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  // Projet Firebase du site QCM (lecture seule des QCM publiés)
  const qapp = initializeApp(qcmConfig, 'qcm');
  qdb = initializeFirestore(qapp, { experimentalAutoDetectLongPolling: true });
}

/* ---------- État ---------- */
const state = {
  user: null, isCoach: false,
  debriefs: [], plays: [], qcmResults: [], allowed: [], quizzes: [], qcmRun: null,
  view: 'debriefs', openDebriefId: null, selectedPlayId: null
};
let unsubs = [];
let signupMode = false;

const isCoachEmail = (email) => !!email && email.trim().toLowerCase() === String(COACH_EMAIL).trim().toLowerCase();

/* ---------- Écrans ---------- */
function showScreen(name) {
  $('loading-screen').hidden = name !== 'loading';
  $('login-screen').hidden = name !== 'login';
  $('pending-screen').hidden = name !== 'pending';
  $('app').hidden = name !== 'app';
}

function friendlyAuthError(e) {
  const c = e && e.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-login')) return 'E-mail ou mot de passe incorrect.';
  if (c.includes('email-already-in-use')) return 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.';
  if (c.includes('weak-password')) return 'Mot de passe trop court (6 caractères minimum).';
  if (c.includes('invalid-email')) return 'Adresse e-mail invalide.';
  if (c.includes('too-many-requests')) return 'Trop de tentatives, réessaie dans quelques minutes.';
  if (c.includes('network')) return 'Problème de connexion internet.';
  return 'Erreur : ' + (e && e.message ? e.message : 'inconnue');
}
function setAuthMsg(err, info) {
  $('auth-error').hidden = !err; $('auth-error').textContent = err || '';
  $('auth-info').hidden = !info; $('auth-info').textContent = info || '';
}
function renderAuthMode() {
  $('auth-name-wrap').hidden = !signupMode;
  $('auth-submit').textContent = signupMode ? 'Créer mon compte' : 'Se connecter';
  $('auth-toggle').innerHTML = signupMode
    ? 'Déjà un compte ? <span>Se connecter</span>'
    : 'Pas encore de compte ? <span>Créer mon compte</span>';
  $('auth-password').autocomplete = signupMode ? 'new-password' : 'current-password';
  setAuthMsg('', '');
}

if (!configured) {
  showScreen('login');
  $('auth-hint').hidden = false;
} else {
  $('auth-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setAuthMsg('', '');
    const email = $('auth-email').value.trim();
    const pwd = $('auth-password').value;
    $('auth-submit').disabled = true;
    try {
      if (signupMode) {
        const cred = await createUserWithEmailAndPassword(auth, email, pwd);
        const name = $('auth-name').value.trim();
        if (name) { try { await updateProfile(cred.user, { displayName: name }); } catch { /* sans gravité */ } }
      } else {
        await signInWithEmailAndPassword(auth, email, pwd);
      }
    } catch (e) {
      setAuthMsg(friendlyAuthError(e), '');
    } finally { $('auth-submit').disabled = false; }
  });
  $('auth-toggle').addEventListener('click', () => { signupMode = !signupMode; renderAuthMode(); });
  $('auth-reset').addEventListener('click', async () => {
    const email = $('auth-email').value.trim();
    if (!email) { setAuthMsg('Saisis ton e-mail ci-dessus, puis clique sur « Mot de passe oublié ».', ''); return; }
    try { await sendPasswordResetEmail(auth, email); setAuthMsg('', 'E-mail de réinitialisation envoyé (pense à regarder les spams).'); }
    catch (e) { setAuthMsg(friendlyAuthError(e), ''); }
  });
  $('logout-btn').addEventListener('click', () => signOut(auth));
  $('pending-logout').addEventListener('click', () => signOut(auth));
  $('pending-check').addEventListener('click', () => { if (state.user) enterApp(state.user); });

  onAuthStateChanged(auth, (user) => {
    stopSubs();
    state.user = user;
    if (!user) { state.isCoach = false; showScreen('login'); renderAuthMode(); return; }
    enterApp(user);
  });
}

async function enterApp(user) {
  showScreen('loading');
  const email = (user.email || '').toLowerCase();
  state.isCoach = isCoachEmail(email);
  let ok = state.isCoach;
  if (!ok) {
    try { ok = (await getDoc(doc(db, 'allowed', email))).exists(); } catch { ok = false; }
  }
  if (!ok) {
    $('pending-email').textContent = user.email || '';
    showScreen('pending');
    return;
  }
  $('user-email').textContent = user.displayName ? `${user.displayName} · ${user.email}` : user.email;
  $('coach-nav').hidden = !state.isCoach;
  if (!state.isCoach && state.view === 'coach') state.view = 'debriefs';
  startSubs();
  showScreen('app');
  render();
}

function stopSubs() { unsubs.forEach(u => { try { u(); } catch { /* */ } }); unsubs = []; }

function startSubs() {
  stopSubs();
  const onErr = (e) => { console.error(e); showToast('Erreur de lecture des données.'); };
  unsubs.push(onSnapshot(query(collection(db, 'debriefs'), orderBy('date', 'desc')), (s) => {
    state.debriefs = s.docs.map(d => ({ id: d.id, ...d.data() })); softRender();
  }, onErr));
  unsubs.push(onSnapshot(query(collection(db, 'plays'), orderBy('date', 'desc')), (s) => {
    state.plays = s.docs.map(d => ({ id: d.id, ...d.data() })); softRender();
  }, onErr));
  unsubs.push(onSnapshot(query(collection(qdb, 'qcm_quizzes'), orderBy('numero', 'asc')), (s) => {
    state.quizzes = s.docs.map(d => ({ id: d.id, ...d.data() })); softRender();
  }, onErr));
  const qres = state.isCoach
    ? collection(db, 'qcmResults')
    : query(collection(db, 'qcmResults'), where('uid', '==', state.user.uid));
  unsubs.push(onSnapshot(qres, (s) => {
    state.qcmResults = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))); softRender();
  }, onErr));
  if (state.isCoach) {
    unsubs.push(onSnapshot(collection(db, 'allowed'), (s) => {
      state.allowed = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)); softRender();
    }, onErr));
  }
}

/* ---------- Navigation / rendu ---------- */
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => {
  state.view = b.dataset.view; state.openDebriefId = null; state.qcmRun = null; render();
}));

function softRender() {
  // Ne pas écraser un champ en cours de saisie
  const a = document.activeElement;
  if (a && $('view-root').contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return;
  render();
}

function render() {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  const root = $('view-root');
  if (state.view === 'debriefs') root.innerHTML = state.openDebriefId ? debriefDetailHtml() : debriefListHtml();
  else if (state.view === 'plays') root.innerHTML = playsHtml();
  else if (state.view === 'qcm') root.innerHTML = qcmHtml();
  else if (state.view === 'coach' && state.isCoach) root.innerHTML = coachHtml();
}

/* ---------- Mes debriefs ---------- */
function debriefListHtml() {
  const rows = state.debriefs.map(d => `
    <div class="list-row clickable" data-action="open-debrief" data-id="${esc(d.id)}">
      <div><div>${esc(d.title || 'Debrief')}</div><div class="sub">${fmtDate(d.date)}${d.niveau ? ' · ' + esc(d.niveau) : ''}</div></div>
      <span class="chev">›</span>
    </div>`).join('');
  return `
    <div class="view-header"><div><h2 class="view-title">Debriefing Perso NM1</h2></div></div>
    <div class="panel">${rows || '<div class="empty"><strong>Aucun debrief pour l\'instant</strong>Ils apparaîtront ici dès que ton coach en publiera.</div>'}</div>`;
}

function cdsClass(v) {
  const x = String(v || '').trim().toUpperCase();
  if (x === 'CC') return 'cds-good';
  if (x === 'IC' || x === 'MC') return 'cds-bad';
  if (x === 'INC') return 'cds-warn';
  return '';
}
function timingClass(v) {
  const x = String(v || '').trim().toLowerCase();
  if (/^(bon|good|oui|ok)/.test(x)) return 'cds-good';
  if (/^(mauvais|bad|non|mauv)/.test(x)) return 'cds-bad';
  return '';
}
const cell = (v) => v ? esc(v) : '<span class="muted-cell">—</span>';

function debriefDetailHtml() {
  const d = state.debriefs.find(x => x.id === state.openDebriefId);
  if (!d) { state.openDebriefId = null; return debriefListHtml(); }
  const link = safeUrl(d.driveLink);
  const rows = d.rows || [];
  const body = rows.map(r => {
    const clip = safeUrl(r.clip);
    return `
    <tr>
      <td>${clip ? `<a class="clip-btn" href="${esc(clip)}" target="_blank" rel="noopener noreferrer">▶ Clip</a>` : cell(r.clip)}</td>
      <td><span class="deb-num">${esc(r.num)}</span></td>
      <td>${r.cds ? `<span class="cds-pill ${cdsClass(r.cds)}">${esc(r.cds)}</span>` : cell('')}</td>
      <td>${cell(r.timing)}</td>
      <td>${r.bonTiming ? `<span class="cds-pill ${timingClass(r.bonTiming)}">${esc(r.bonTiming)}</span>` : cell('')}</td>
      <td>${cell(r.nature)}</td>
      <td>${cell(r.detail)}</td>
      <td>${cell(r.iotMeca)}</td>
    </tr>`;
  }).join('');
  return `
    <button class="btn btn-ghost deb-back" data-action="back-debriefs">← Tous les matchs</button>
    <div class="deb-hero">
      <div class="deb-kicker">Debriefing Perso NM1</div>
      <h2 class="deb-title">${esc(d.title || 'Debrief')}</h2>
      <div class="deb-pills">
        ${d.date ? `<span class="pill">${fmtDate(d.date)}</span>` : ''}
        ${d.niveau ? `<span class="pill"><strong>${esc(d.niveau)}</strong></span>` : ''}
        <span class="pill"><strong>${rows.length}</strong> action${rows.length > 1 ? 's' : ''} analysée${rows.length > 1 ? 's' : ''}</span>
      </div>
    </div>
    ${link ? `<div class="drive-box" style="margin-bottom:20px;"><div class="drive-box-text"><strong>Les clips du match</strong><span>Retrouve tous les extraits vidéo dans le dossier Google Drive.</span></div><a class="btn btn-primary btn-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ouvrir le dossier Drive ↗</a></div>` : ''}
    <div class="deb-card">
      <div class="deb-card-head">Analyse play by play<span>${rows.length} ligne${rows.length > 1 ? 's' : ''}</span></div>
      <div class="table-scroll"><table class="deb-table">
        <thead><tr><th>Clip</th><th>#</th><th>CDS</th><th>Timing</th><th>Bon timing</th><th>Nature</th><th>Détail</th><th>IOT / MÉCA</th></tr></thead>
        <tbody>${body || '<tr><td colspan="8"><div class="empty">Aucune action renseignée.</div></td></tr>'}</tbody>
      </table></div>
    </div>`;
}

/* ---------- Play de la semaine ---------- */
function playBlock(p) {
  const emb = embedFromUrl(p.videoUrl);
  const link = safeUrl(p.videoUrl);
  return `
    <article class="play-card">
      <div class="play-head"><h3>${esc(p.title || 'Play de la semaine')}</h3><span class="play-date">${fmtDate(p.date)}</span></div>
      ${emb || (link ? `<p style="margin-bottom:14px;"><a class="btn" href="${esc(link)}" target="_blank" rel="noopener noreferrer">▶ Ouvrir la vidéo</a></p>` : '')}
      ${p.comment ? `<div class="comment-box">${esc(p.comment)}</div>` : ''}
    </article>`;
}
function playsHtml() {
  return `
    <div class="view-header"><div><h2 class="view-title">Play de la semaine</h2></div></div>
    ${state.plays.length ? state.plays.map(playBlock).join('') : '<div class="panel"><div class="empty"><strong>Pas encore de play</strong>Reviens bientôt.</div></div>'}`;
}

/* ---------- QCM ---------- */
function avgOf(list) {
  const valid = list.filter(r => r.total > 0);
  if (!valid.length) return null;
  return valid.reduce((s, r) => s + r.score / r.total * 10, 0) / valid.length;
}
const fmtAvg = (v) => (Math.round(v * 10) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const myResults = () => state.isCoach ? state.qcmResults.filter(r => r.uid === state.user.uid) : state.qcmResults;
const resultFor = (quizId) => myResults().find(r => r.qcmId === quizId);
const quizLabel = (q) => `QCM n°${q.numero} — ${q.titre}`;
const optLabel = (q, i) => (q.options && q.options[i] != null) ? q.options[i] : '—';

function detailHtml(quiz, answers) {
  return quiz.questions.map((q, i) => {
    const given = answers[i], ok = given === q.bonneReponse;
    return `<div class="list-row" style="flex-direction:column;align-items:flex-start;">
      <div><strong>${i + 1}.</strong> ${esc(q.texte)}</div>
      <div class="sub">Ta réponse : <strong style="color:${ok ? 'var(--positive)' : '#ff8f8f'}">${esc(optLabel(q, given))}</strong> — ${ok ? 'Correct' : 'Incorrect'}</div>
      ${ok ? '' : `<div class="sub">Bonne réponse : <strong>${esc(optLabel(q, q.bonneReponse))}</strong></div>${q.explication ? `<div class="sub">${esc(q.explication)}</div>` : ''}`}
    </div>`;
  }).join('');
}

function qcmRunHtml() {
  const run = state.qcmRun, quiz = run.quiz, total = quiz.questions.length;
  if (run.review || run.finished) {
    const score = run.finished ? run.score : (resultFor(quiz.id)?.score ?? 0);
    return `
      <div class="view-header"><div><h2 class="view-title">${esc(quizLabel(quiz))}</h2><p class="view-sub">Résultat</p></div>
        <button class="btn btn-ghost" data-action="qcm-back">← Retour</button></div>
      <div class="panel"><div class="big-avg">${score}/${total}</div></div>
      <div class="panel"><div class="panel-title"><span>Détail des réponses</span></div>${detailHtml(quiz, run.answers)}</div>`;
  }
  const q = quiz.questions[run.idx];
  return `
    <div class="view-header"><div><h2 class="view-title">${esc(quizLabel(quiz))}</h2><p class="view-sub">Question ${run.idx + 1}/${total}</p></div>
      <button class="btn btn-ghost" data-action="qcm-back">Abandonner</button></div>
    <div class="panel">
      <p style="font-size:16px;line-height:1.6;margin-bottom:18px;">${esc(q.texte)}</p>
      ${q.options.map((o, i) => `<div class="list-row clickable" data-action="qcm-pick" data-id="${i}" style="${run.selected === i ? 'border:1px solid var(--accent);background:var(--accent-soft);border-radius:6px;' : ''}"><div>${esc(o)}</div></div>`).join('')}
      <div style="margin-top:18px;"><button class="btn btn-primary" data-action="qcm-validate" ${run.selected == null ? 'disabled' : ''}>${run.idx + 1 < total ? 'Valider ma réponse' : 'Terminer le QCM'}</button></div>
    </div>`;
}

function qcmHtml() {
  if (state.qcmRun) return qcmRunHtml();
  const mine = myResults();
  const avg = avgOf(mine);
  const quizzes = [...state.quizzes].sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const latest = quizzes[0];
  const quizRow = (q) => {
    const r = resultFor(q.id);
    return `<div class="list-row">
      <div><div>${esc(quizLabel(q))}</div><div class="sub">${r ? `Réalisé : ${esc(r.score)}/${esc(r.total)}` : 'Pas encore réalisé'}</div></div>
      ${r ? `<button class="btn btn-ghost" data-action="qcm-review" data-id="${esc(q.id)}">Revoir</button>`
          : `<button class="btn btn-primary" data-action="qcm-start" data-id="${esc(q.id)}">Commencer</button>`}
    </div>`;
  };
  return `
    <div class="view-header"><div><h2 class="view-title">QCM</h2><p class="view-sub">Le QCM de la semaine et ta progression.</p></div></div>
    <div class="panel">
      <div class="panel-title"><span>Ma moyenne</span></div>
      ${avg === null ? '<div class="empty" style="padding:14px 0;"><strong>Aucun QCM réalisé</strong>Ta moyenne s\'affichera ici.</div>'
        : `<div class="big-avg">${fmtAvg(avg)}<span style="font-size:22px;color:var(--text-muted);"> /10</span></div><p class="view-sub">sur ${mine.length} QCM réalisé${mine.length > 1 ? 's' : ''}</p>`}
    </div>
    <div class="panel">
      <div class="panel-title"><span>QCM de la semaine</span></div>
      ${latest ? quizRow(latest) : '<div class="empty" style="padding:14px 0;"><strong>Aucun QCM publié</strong>Reviens bientôt.</div>'}
    </div>
    ${quizzes.length > 1 ? `<div class="panel"><div class="panel-title"><span>QCM précédents</span></div>${quizzes.slice(1).map(quizRow).join('')}</div>` : ''}`;
}

/* ---------- Espace coach ---------- */
function coachHtml() {
  const refs = state.allowed.map(a => {
    const res = state.qcmResults.filter(r => (r.email || '').toLowerCase() === a.id);
    const avg = avgOf(res);
    return `<div class="list-row">
      <div><div>${esc(a.name || a.id)}</div><div class="sub">${esc(a.id)} · ${avg === null ? 'aucun QCM' : `moyenne ${fmtAvg(avg)}/10 (${res.length} QCM)`}</div></div>
      <button class="btn btn-ghost btn-danger" data-action="remove-allowed" data-id="${esc(a.id)}">Retirer</button></div>`;
  }).join('');
  const plays = state.plays.map(p => `<div class="list-row">
      <div><div>${esc(p.title || 'Play')}</div><div class="sub">${fmtDate(p.date)}</div></div>
      <div class="row-actions"><button class="btn btn-ghost" data-action="edit-play" data-id="${esc(p.id)}">Modifier</button>
      <button class="btn btn-ghost btn-danger" data-action="delete-play" data-id="${esc(p.id)}">Supprimer</button></div></div>`).join('');
  const debs = state.debriefs.map(d => `<div class="list-row">
      <div><div>${esc(d.title || 'Debrief')}</div><div class="sub">${fmtDate(d.date)}</div></div>
      <div class="row-actions"><button class="btn btn-ghost" data-action="edit-debrief" data-id="${esc(d.id)}">Lien Drive</button>
      <button class="btn btn-ghost btn-danger" data-action="delete-debrief" data-id="${esc(d.id)}">Supprimer</button></div></div>`).join('');
  return `
    <div class="view-header"><div><h2 class="view-title">Espace coach</h2><p class="view-sub">Gère tes arbitres, tes plays et tes debriefs.</p></div></div>
    <div class="panel">
      <div class="panel-title"><span>Arbitres autorisés</span></div>
      <form class="inline-form" data-form="add-allowed" style="margin-bottom:14px;">
        <input type="text" name="name" placeholder="Prénom (facultatif)">
        <input type="email" name="email" placeholder="E-mail de l'arbitre" required>
        <button class="btn btn-primary" type="submit">Autoriser</button>
      </form>
      <p class="view-sub" style="margin:0 0 10px;">L'arbitre crée son compte avec cette adresse e-mail ; l'accès s'ouvre dès qu'elle figure dans cette liste.</p>
      ${refs || '<div class="empty" style="padding:14px 0;">Aucun arbitre pour l\'instant.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title"><span>Play de la semaine</span><button class="btn btn-primary" data-action="new-play">+ Nouveau play</button></div>
      ${plays || '<div class="empty" style="padding:14px 0;">Aucun play publié.</div>'}
    </div>
    <div class="panel">
      <div class="panel-title"><span>Debriefs publiés</span></div>
      <p class="view-sub" style="margin:0 0 10px;">Les debriefs se publient depuis ton site d'arbitrage (bouton « Publier au coaching »).</p>
      ${debs || '<div class="empty" style="padding:14px 0;">Aucun debrief publié.</div>'}
    </div>`;
}

function playModal(p) {
  openModal(`
    <h3 class="modal-title">${p ? 'Modifier le play' : 'Nouveau play de la semaine'}</h3>
    <p class="modal-sub">Colle un lien YouTube, Google Drive (partagé « toute personne avec le lien ») ou Vimeo.</p>
    <form data-form="save-play" data-id="${p ? esc(p.id) : ''}">
      <div class="form-field"><label>Titre</label><input name="title" value="${esc(p?.title || '')}" required></div>
      <div class="form-field"><label>Date</label><input type="date" name="date" value="${esc(p?.date || todayISO())}" required></div>
      <div class="form-field"><label>Lien de la vidéo</label><input name="videoUrl" value="${esc(p?.videoUrl || '')}" placeholder="https://…"></div>
      <div class="form-field"><label>Commentaire</label><textarea name="comment" rows="6">${esc(p?.comment || '')}</textarea></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Annuler</button>
      <button type="submit" class="btn btn-primary">Enregistrer</button></div>
    </form>`);
}
function driveModal(d) {
  openModal(`
    <h3 class="modal-title">Lien du dossier Drive</h3>
    <p class="modal-sub">${esc(d.title || '')}</p>
    <form data-form="save-drive" data-id="${esc(d.id)}">
      <div class="form-field"><label>Lien Google Drive</label><input name="driveLink" value="${esc(d.driveLink || '')}" placeholder="https://drive.google.com/…"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Annuler</button>
      <button type="submit" class="btn btn-primary">Enregistrer</button></div>
    </form>`);
}

/* ---------- Événements délégués ---------- */
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) { if (ev.target === $('modal-backdrop')) closeModal(); return; }
  const a = el.dataset.action, id = el.dataset.id;
  try {
    if (a === 'open-debrief') { state.openDebriefId = id; render(); window.scrollTo(0, 0); }
    else if (a === 'back-debriefs') { state.openDebriefId = null; render(); }
    else if (a === 'qcm-start') {
      const quiz = state.quizzes.find(x => x.id === id);
      if (quiz && !resultFor(id)) { state.qcmRun = { quiz, idx: 0, answers: [], selected: null }; render(); window.scrollTo(0, 0); }
    }
    else if (a === 'qcm-review') {
      const quiz = state.quizzes.find(x => x.id === id), r = resultFor(id);
      if (quiz && r) { state.qcmRun = { quiz, review: true, answers: r.answers || [] }; render(); window.scrollTo(0, 0); }
    }
    else if (a === 'qcm-back') { state.qcmRun = null; render(); }
    else if (a === 'qcm-pick') { if (state.qcmRun) { state.qcmRun.selected = Number(id); render(); } }
    else if (a === 'qcm-validate') { await qcmValidate(); }
    else if (a === 'close-modal') closeModal();
    else if (a === 'new-play') playModal(null);
    else if (a === 'edit-play') playModal(state.plays.find(p => p.id === id));
    else if (a === 'edit-debrief') driveModal(state.debriefs.find(d => d.id === id));
    else if (a === 'delete-play') { if (confirm('Supprimer ce play ?')) { await deleteDoc(doc(db, 'plays', id)); showToast('Play supprimé'); } }
    else if (a === 'delete-debrief') { if (confirm('Supprimer ce debrief ?')) { await deleteDoc(doc(db, 'debriefs', id)); showToast('Debrief supprimé'); } }
    else if (a === 'remove-allowed') { if (confirm('Retirer l\'accès de ' + id + ' ?')) { await deleteDoc(doc(db, 'allowed', id)); showToast('Accès retiré'); } }
  } catch (e) { console.error(e); showToast('Action impossible : ' + (e.code || e.message)); }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.form === 'add-allowed') {
      const email = String(f.email || '').trim().toLowerCase();
      if (!email) return;
      await setDoc(doc(db, 'allowed', email), { email, name: String(f.name || '').trim(), addedAt: serverTimestamp() });
      form.reset(); showToast('Arbitre autorisé');
    } else if (form.dataset.form === 'save-play') {
      const data = { title: f.title.trim(), date: f.date, videoUrl: (f.videoUrl || '').trim(), comment: f.comment || '' };
      if (data.videoUrl && !safeUrl(data.videoUrl)) { showToast('Lien vidéo invalide'); return; }
      if (form.dataset.id) await updateDoc(doc(db, 'plays', form.dataset.id), data);
      else await addDoc(collection(db, 'plays'), { ...data, createdAt: serverTimestamp() });
      closeModal(); showToast('Play enregistré');
    } else if (form.dataset.form === 'save-drive') {
      const link = (f.driveLink || '').trim();
      if (link && !safeUrl(link)) { showToast('Lien invalide'); return; }
      await updateDoc(doc(db, 'debriefs', form.dataset.id), { driveLink: link });
      closeModal(); showToast('Lien enregistré');
    }
  } catch (e) { console.error(e); showToast('Enregistrement impossible : ' + (e.code || e.message)); }
});


async function qcmValidate() {
  const run = state.qcmRun;
  if (!run || run.selected == null) return;
  run.answers.push(run.selected);
  run.selected = null;
  const quiz = run.quiz;
  if (run.idx + 1 < quiz.questions.length) { run.idx++; render(); window.scrollTo(0, 0); return; }
  const score = quiz.questions.reduce((s, q, i) => s + (run.answers[i] === q.bonneReponse ? 1 : 0), 0);
  run.finished = true; run.score = score;
  render(); window.scrollTo(0, 0);
  try {
    await setDoc(doc(db, 'qcmResults', `${state.user.uid}_${quiz.id}`), {
      uid: state.user.uid, email: (state.user.email || '').toLowerCase(),
      name: state.user.displayName || '', qcmId: quiz.id, qcmTitle: quizLabel(quiz),
      qcmNumero: quiz.numero || 0, score, total: quiz.questions.length,
      answers: run.answers, date: todayISO()
    });
  } catch (e) { console.error(e); showToast("Résultat non enregistré : " + (e.code || e.message)); }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal-backdrop').hidden) closeModal(); });
