/**
 * Denná otázka – webový klient (Firebase Auth Google + Firestore).
 * Používa Firebase compat cez klasické <script> z CDN (funguje aj pri otvorení súboru z disku, kde ES moduly zlyhávajú).
 */
/* global firebase */

/** Rovnaký Firebase projekt ako Android appka (google-services.json → quizbrothers-cbc89). Rezervácia na webe ostáva na projekte quizbrothers-rezervacia. */
const firebaseConfig = {
  apiKey: 'AIzaSyAwSLlzVdjhHB1FQxmizBrkmBk5-Y_z318',
  authDomain: 'quizbrothers-cbc89.firebaseapp.com',
  databaseURL: 'https://quizbrothers-cbc89-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'quizbrothers-cbc89',
  storageBucket: 'quizbrothers-cbc89.firebasestorage.app',
  messagingSenderId: '969134044728',
  appId: '1:969134044728:web:d8f1281b09c42024ecd8cd',
  measurementId: 'G-8M8C5XR0DD'
};

if (typeof firebase === 'undefined') {
  const el = document.getElementById('daily-status');
  if (el) {
    el.textContent =
      'Firebase sa nenačítal. Skús obnoviť stránku alebo ju otvoriť cez internet (nie file:// z disku bez skriptov).';
  }
  throw new Error('Firebase SDK missing');
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const TZ = 'Europe/Bratislava';
const LEADERBOARD_MAX = 50;
const DEFAULT_TIMER_SEC = 15;

function $(id) {
  return document.getElementById(id);
}

function todayStringBratislava() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function yearMonthBratislava() {
  return todayStringBratislava().slice(0, 7);
}

function dayOfMonthBratislava() {
  const d = parseInt(todayStringBratislava().slice(8, 10), 10);
  return Number.isFinite(d) ? d : 1;
}

function stripOptionPrefix(text) {
  return String(text).replace(/^[A-D]:\s*/i, '').trim();
}

function buildOptionsList(optionsRaw) {
  if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) return [];
  const list = [];
  const letterAt = () => String.fromCharCode(65 + list.length);
  optionsRaw.forEach((option, index) => {
    if (option && typeof option === 'object' && !Array.isArray(option)) {
      const oa = option.option_a;
      const ob = option.option_b;
      if (oa != null && oa !== '') list.push({ letter: letterAt(), text: stripOptionPrefix(String(oa)) });
      if (ob != null && ob !== '') list.push({ letter: letterAt(), text: stripOptionPrefix(String(ob)) });
    } else if (typeof option === 'string') {
      list.push({ letter: String.fromCharCode(65 + index), text: stripOptionPrefix(option) });
    }
  });
  return list;
}

function parseQuestionData(data) {
  if (!data || typeof data.question !== 'string') return null;
  const options = buildOptionsList(data.options);
  if (options.length === 0) return null;
  const points = data.points != null ? Number(data.points) : 1;
  const correct = Array.isArray(data.correct_answers)
    ? data.correct_answers.map((x) => String(x).toUpperCase())
    : ['A'];
  const timeSec = data.time != null ? Math.max(1, Number(data.time)) : DEFAULT_TIMER_SEC;
  const explanation = data.explanation != null ? String(data.explanation) : '';
  return {
    question: data.question,
    points: Number.isFinite(points) ? points : 1,
    correct_answers: correct,
    time: timeSec,
    explanation,
    optionsFlat: options
  };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseLeaderboardEntries(docSnap) {
  if (!docSnap.exists) return [];
  const entries = docSnap.data().entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((item, index) => {
      const map = item && typeof item === 'object' ? item : null;
      if (!map) return null;
      const nickname = String(map.nickname || '').trim();
      if (!nickname) return null;
      const points = map.points != null ? Number(map.points) : 0;
      const timeMs = map.timeMs != null ? Number(map.timeMs) : 0;
      const userId = map.userId ? String(map.userId) : '';
      const rank = map.rank != null ? Number(map.rank) : index + 1;
      return { rank, nickname, points, timeMs, userId };
    })
    .filter(Boolean)
    .slice(0, LEADERBOARD_MAX);
}

function parseStreakEntries(docSnap) {
  if (!docSnap.exists) return [];
  const entries = docSnap.data().entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .map((item, index) => {
      const map = item && typeof item === 'object' ? item : null;
      if (!map) return null;
      const nickname = String(map.nickname || '').trim() || 'Hráč';
      const bestStreakDays = map.bestStreakDays != null ? Number(map.bestStreakDays) : 0;
      const rank = map.rank != null ? Number(map.rank) : index + 1;
      return { rank, nickname, bestStreakDays };
    })
    .filter(Boolean)
    .slice(0, LEADERBOARD_MAX);
}

function parseChampion(docSnap) {
  const list = parseLeaderboardEntries(docSnap);
  return list[0] || null;
}

const state = {
  user: null,
  profile: { nickname: '', full_name: '', location: '', team: '', avatar_index: 0 },
  answeredToday: false,
  activePanel: 'auth',
  question: null,
  shuffled: [],
  selectedLetter: null,
  answerLocked: false,
  timerId: null,
  questionStartMs: 0,
  result: null,
  lbTab: 'day',
  locationsLoaded: false
};

function setStatus(msg) {
  const el = $('daily-status');
  if (el) el.textContent = msg || '';
}

function showPanel(name) {
  ['panel-auth', 'panel-profile', 'panel-hub', 'panel-question', 'panel-result', 'panel-leaderboards'].forEach((id) => {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== `panel-${name}`);
  });
  state.activePanel = name;
}

function profileComplete() {
  const p = state.profile;
  return (
    p.nickname.trim() &&
    p.full_name.trim() &&
    p.location.trim() &&
    p.team.trim()
  );
}

async function loadUserProfileDoc(uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    state.profile = { nickname: '', full_name: '', location: '', team: '', avatar_index: 0 };
    return;
  }
  const d = snap.data();
  state.profile = {
    nickname: String(d.nickname || '').trim(),
    full_name: String(d.full_name || d.fullName || '').trim(),
    location: String(d.location || '').trim(),
    team: String(d.team || d.teamName || '').trim(),
    avatar_index: d.avatar_index != null ? Number(d.avatar_index) : 0
  };
}

async function saveUserProfileDoc() {
  const uid = state.user?.uid;
  if (!uid) return;
  const p = state.profile;
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        nickname: p.nickname.trim(),
        full_name: p.full_name.trim(),
        location: p.location.trim(),
        team: p.team.trim(),
        avatar_index: Math.max(0, Math.min(230, p.avatar_index || 0))
      },
      { merge: true }
    );
}

function fillProfileBasics() {
  $('pf-nickname').value = state.profile.nickname;
  $('pf-fullname').value = state.profile.full_name;
  $('pf-location').value = state.profile.location;
}

async function loadLocationsSelect() {
  const sel = $('pf-location');
  const current = state.profile.location;
  const snap = await db.collection('locations').get();
  const ids = snap.docs.map((d) => d.id).filter(Boolean).sort();
  sel.innerHTML = '<option value="">— vyber lokáciu —</option>';
  ids.forEach((id) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    sel.appendChild(o);
  });
  if (current && ids.includes(current)) sel.value = current;
  state.locationsLoaded = true;
}

async function loadTeamsForLocation(locationName) {
  const sel = $('pf-team');
  if (!locationName) {
    sel.innerHTML = '<option value="">— najprv vyber lokáciu —</option>';
    return;
  }
  const snap = await db.collection('locations').doc(locationName).get();
  if (!snap.exists) {
    sel.innerHTML = '<option value="">(žiadne tímy)</option>';
    return;
  }
  const teams = snap.data().teams;
  const list = Array.isArray(teams)
    ? teams.map((t) => String(t).trim()).filter(Boolean).sort()
    : [];
  sel.innerHTML = '<option value="">— vyber tím —</option>';
  list.forEach((t) => {
    const o = document.createElement('option');
    o.value = t;
    o.textContent = t;
    sel.appendChild(o);
  });
  if (state.profile.team && list.includes(state.profile.team)) sel.value = state.profile.team;
}

async function checkAnsweredToday(uid) {
  const t = todayStringBratislava();
  const snap = await db.collection('daily_submissions').doc(`${t}_${uid}`).get();
  return snap.exists;
}

async function ensureQuestionOrder(uid, ym) {
  const docId = `${uid}_${ym}`;
  const ref = db.collection('daily_question_orders').doc(docId);
  const snap = await ref.get();
  if (snap.exists) {
    const order = snap.data().order;
    if (Array.isArray(order) && order.length >= 31) {
      return order.slice(0, 31).map((n) => Number(n));
    }
  }
  const newOrder = shuffle(Array.from({ length: 31 }, (_, i) => i + 1));
  await ref.set({ order: newOrder });
  return newOrder;
}

async function loadDailyQuestionForUser(uid) {
  const ym = yearMonthBratislava();
  const dom = dayOfMonthBratislava();
  const idx = Math.min(Math.max(dom - 1, 0), 30);
  const order = await ensureQuestionOrder(uid, ym);
  if (!order || order.length <= idx) throw new Error('Nepodarilo sa získať poradie otázok.');
  const qnum = order[idx];
  const qid = `${ym}_${qnum}`;
  const qsnap = await db.collection('daily_questions').doc(qid).get();
  if (!qsnap.exists) throw new Error('Otázka pre tento deň ešte nie je dostupná.');
  const q = parseQuestionData(qsnap.data());
  if (!q) throw new Error('Otázku sa nepodarilo spracovať.');
  return q;
}

function clearTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function renderQuestionUI() {
  const q = state.question;
  $('question-loading').classList.add('hidden');
  $('question-error').classList.add('hidden');
  $('question-body').classList.remove('hidden');
  $('btn-q-back').classList.remove('hidden');
  $('question-text').textContent = q.question;
  const opts = $('question-options');
  opts.innerHTML = '';
  state.shuffled.forEach((opt, index) => {
    const btn = document.createElement('button');
    const displayLetter = String.fromCharCode(65 + index);
    btn.type = 'button';
    btn.textContent = `${displayLetter}: ${opt.text}`;
    if (state.selectedLetter === opt.letter) btn.classList.add('daily-opt-selected');
    btn.disabled = state.answerLocked;
    btn.onclick = () => {
      if (state.answerLocked) return;
      state.selectedLetter = opt.letter;
      renderQuestionUI();
    };
    opts.appendChild(btn);
  });
  let left = q.time;
  $('question-timer').textContent = String(left);
  clearTimer();
  state.timerId = setInterval(() => {
    if (state.answerLocked) return;
    left -= 1;
    $('question-timer').textContent = String(Math.max(0, left));
    if (left <= 0) {
      clearTimer();
      submitAnswer();
    }
  }, 1000);
}

function submitAnswer() {
  if (state.answerLocked || !state.question) return;
  state.answerLocked = true;
  clearTimer();
  const q = state.question;
  const maxMs = q.time * 1000;
  const elapsed = Math.min(Date.now() - state.questionStartMs, maxMs);
  const correct =
    state.selectedLetter != null && q.correct_answers.includes(state.selectedLetter);
  const points = correct ? q.points : 0;
  state.result = {
    correct,
    points,
    timeMs: elapsed,
    correctLetter: q.correct_answers[0] || 'A',
    selectedLetter: state.selectedLetter,
    explanation: q.explanation
  };
  const uid = state.user.uid;
  const today = todayStringBratislava();
  const data = {
    date: today,
    userId: uid,
    fullName: state.profile.full_name.trim(),
    nickname: state.profile.nickname.trim(),
    points,
    timeMs: elapsed,
    location: state.profile.location.trim(),
    teamName: state.profile.team.trim(),
    country: 'Svet',
    avatar_index: Math.max(0, Math.min(230, state.profile.avatar_index || 0)),
    timestamp: FieldValue.serverTimestamp()
  };
  db.collection('daily_submissions')
    .doc(`${today}_${uid}`)
    .set(data)
    .then(() => {
      state.answeredToday = true;
    })
    .catch((e) => {
      setStatus('Odpoveď sa nepodarilo uložiť: ' + (e.message || 'chyba'));
    });
  showResultUI();
}

function showResultUI() {
  showPanel('result');
  const r = state.result;
  const q = state.question;
  $('result-title').textContent = r.correct ? 'Správne!' : 'Ďakujeme za účasť';
  const sec = (r.timeMs / 1000).toFixed(1);
  $('result-summary').textContent = r.correct
    ? `+${r.points} bodov • čas ${sec} s`
    : `0 bodov • čas ${sec} s`;
  const wrap = $('result-options');
  wrap.innerHTML = '';
  state.shuffled.forEach((opt, index) => {
    const btn = document.createElement('button');
    const displayLetter = String.fromCharCode(65 + index);
    btn.type = 'button';
    btn.disabled = true;
    btn.textContent = `${displayLetter}: ${opt.text}`;
    if (opt.letter === r.correctLetter) btn.classList.add('daily-opt-correct');
    else if (opt.letter === r.selectedLetter) btn.classList.add('daily-opt-wrong');
    wrap.appendChild(btn);
  });
  $('result-explanation').textContent = r.explanation || '';
}

async function startQuestionFlow() {
  if (state.answeredToday) {
    setStatus('Dnes už máš odpoveď zapísanú.');
    return;
  }
  setStatus('');
  showPanel('question');
  $('question-loading').classList.remove('hidden');
  $('question-error').classList.add('hidden');
  $('question-body').classList.add('hidden');
  $('btn-q-back').classList.add('hidden');
  try {
    const q = await loadDailyQuestionForUser(state.user.uid);
    state.question = q;
    state.shuffled = shuffle(q.optionsFlat);
    state.selectedLetter = null;
    state.answerLocked = false;
    state.questionStartMs = Date.now();
    renderQuestionUI();
  } catch (e) {
    $('question-loading').classList.add('hidden');
    $('question-error').classList.remove('hidden');
    $('question-error').textContent = e.message || 'Nepodarilo sa načítať otázku.';
    $('btn-q-back').classList.remove('hidden');
  }
}

async function renderLeaderboardTab() {
  const content = $('lb-content');
  const ch = $('lb-champions');
  ch.innerHTML = '';
  content.textContent = 'Načítavam…';

  try {
    if (state.lbTab === 'day') {
      const [todayDoc, yestDoc] = await Promise.all([
        db.collection('leaderboards').doc('daily_today').get(),
        db.collection('leaderboards').doc('daily_yesterday').get()
      ]);
      const y = parseChampion(yestDoc);
      if (y) {
        ch.innerHTML = `<div><strong>Víťaz včera:</strong> ${escapeHtml(y.nickname)} (${y.points} b.)</div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(todayDoc), true);
    } else if (state.lbTab === 'week') {
      const [wDoc, pDoc] = await Promise.all([
        db.collection('leaderboards').doc('weekly_stats').get(),
        db.collection('leaderboards').doc('weekly_previous').get()
      ]);
      const prev = parseChampion(pDoc);
      if (prev) {
        ch.innerHTML = `<div><strong>Víťaz minulého týždňa:</strong> ${escapeHtml(prev.nickname)}</div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(wDoc), true);
    } else if (state.lbTab === 'month') {
      const [mDoc, pDoc] = await Promise.all([
        db.collection('leaderboards').doc('monthly_stats').get(),
        db.collection('leaderboards').doc('monthly_previous').get()
      ]);
      const prev = parseChampion(pDoc);
      if (prev) {
        ch.innerHTML = `<div><strong>Víťaz minulého mesiaca:</strong> ${escapeHtml(prev.nickname)}</div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(mDoc), true);
    } else if (state.lbTab === 'streak') {
      const sDoc = await db.collection('leaderboards').doc('streak_stats').get();
      content.innerHTML = renderStreakList(parseStreakEntries(sDoc));
    } else if (state.lbTab === 'badges') {
      const bDoc = await db.collection('badges').doc(state.user.uid).get();
      const d = bDoc.exists ? bDoc.data() : {};
      content.innerHTML = renderBadges(d);
    } else if (state.lbTab === 'myteam') {
      const loc = state.profile.location.trim();
      if (!loc) {
        content.innerHTML = '<p>Nemáš vyplnenú lokáciu v profile.</p>';
        return;
      }
      const lDoc = await db.collection('locations').doc(loc).get();
      if (!lDoc.exists) {
        content.innerHTML = '<p>Pre tvoju lokáciu nie sú dáta.</p>';
        return;
      }
      const raw = lDoc.data().seasonRanking;
      content.innerHTML = renderMyTeam(raw);
    }
  } catch (e) {
    content.textContent = 'Chyba: ' + (e.message || 'načítanie');
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function renderEntryList(entries, showTime) {
  if (!entries.length) return '<p>Rebríček je prázdny alebo sa ešte prepočítava.</p>';
  return entries
    .map(
      (e) => `
    <div class="daily-lb-row">
      <span class="daily-lb-rank">${e.rank}</span>
      <span class="daily-lb-name">${escapeHtml(e.nickname)}</span>
      <span class="daily-lb-meta">${e.points} b.${showTime ? ` • ${(e.timeMs / 1000).toFixed(1)} s` : ''}</span>
    </div>`
    )
    .join('');
}

function renderStreakList(entries) {
  if (!entries.length) return '<p>Žiadne dáta.</p>';
  return entries
    .map(
      (e) => `
    <div class="daily-lb-row">
      <span class="daily-lb-rank">${e.rank}</span>
      <span class="daily-lb-name">${escapeHtml(e.nickname)}</span>
      <span class="daily-lb-meta">${e.bestStreakDays} dní</span>
    </div>`
    )
    .join('');
}

function renderBadges(d) {
  const dw = d.daily_wins != null ? Number(d.daily_wins) : 0;
  const ww = d.weekly_wins != null ? Number(d.weekly_wins) : 0;
  const mw = d.monthly_wins != null ? Number(d.monthly_wins) : 0;
  const cs = d.current_streak != null ? Number(d.current_streak) : 0;
  const bs = d.best_streak != null ? Number(d.best_streak) : 0;
  return `
    <div class="daily-badges-grid">
      <div class="daily-badge-item"><span>${dw}</span>Víťazstiev dňa</div>
      <div class="daily-badge-item"><span>${ww}</span>Víťazstiev týždňa</div>
      <div class="daily-badge-item"><span>${mw}</span>Víťazstiev mesiaca</div>
      <div class="daily-badge-item"><span>${cs}</span>Aktuálna séria</div>
      <div class="daily-badge-item"><span>${bs}</span>Najlepšia séria</div>
    </div>`;
}

function renderMyTeam(raw) {
  if (!Array.isArray(raw) || !raw.length) return '<p>Sezónne poradie tímov zatiaľ nie je k dispozícii.</p>';
  const rows = raw
    .map((item) => {
      const m = item && typeof item === 'object' ? item : null;
      if (!m) return null;
      const team = String(m.team || '').trim();
      if (!team) return null;
      const pts =
        m.totalPoints != null
          ? Number(m.totalPoints)
          : m.points != null
            ? Number(m.points)
            : 0;
      return { team, pts };
    })
    .filter(Boolean)
    .sort((a, b) => b.pts - a.pts);
  if (!rows.length) return '<p>Žiadne tímy v poradí.</p>';
  return rows
    .map(
      (e, i) => `
    <div class="daily-lb-row">
      <span class="daily-lb-rank">${i + 1}</span>
      <span class="daily-lb-name">${escapeHtml(e.team)}</span>
      <span class="daily-lb-meta">${e.pts} b.</span>
    </div>`
    )
    .join('');
}

async function openLeaderboards() {
  state.lbTab = 'day';
  document.querySelectorAll('.daily-lb-tab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-lb') === 'day');
  });
  showPanel('leaderboards');
  await renderLeaderboardTab();
}

async function refreshUIForUser() {
  const u = state.user;
  if (!u) {
    showPanel('auth');
    return;
  }
  setStatus('');
  await loadUserProfileDoc(u.uid);
  state.answeredToday = await checkAnsweredToday(u.uid);

  if (!profileComplete()) {
    showPanel('profile');
    if (!state.locationsLoaded) await loadLocationsSelect();
    fillProfileBasics();
    await loadTeamsForLocation($('pf-location').value || state.profile.location);
    $('pf-team').value = state.profile.team;
    return;
  }

  showPanel('hub');
  const mail = u.email || '';
  $('hub-greeting').textContent = `Ahoj, ${state.profile.nickname}!${mail ? ` (${mail})` : ''}`;
  const note = $('hub-answered-note');
  if (state.answeredToday) {
    note.classList.remove('hidden');
    note.textContent = 'Dnes už máš odpoveď zapísanú. Môžeš si pozrieť rebríčky.';
    $('btn-start').disabled = true;
  } else {
    note.classList.add('hidden');
    $('btn-start').disabled = false;
  }
}

async function signInGoogle() {
  setStatus('');
  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    const code = e?.code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await auth.signInWithRedirect(googleProvider);
      return;
    }
    setStatus(e.message || 'Prihlásenie zlyhalo.');
  }
}

function wireEvents() {
  $('btn-google').onclick = () => signInGoogle();

  $('form-profile').onsubmit = async (ev) => {
    ev.preventDefault();
    setStatus('');
    state.profile.nickname = $('pf-nickname').value.trim();
    state.profile.full_name = $('pf-fullname').value.trim();
    state.profile.location = $('pf-location').value.trim();
    state.profile.team = $('pf-team').value.trim();
    if (!profileComplete()) {
      setStatus('Vyplň všetky polia.');
      return;
    }
    try {
      await saveUserProfileDoc();
      await refreshUIForUser();
    } catch (e) {
      setStatus('Uloženie profilu zlyhalo: ' + (e.message || ''));
    }
  };

  $('pf-location').onchange = async () => {
    const loc = $('pf-location').value;
    state.profile.location = loc;
    $('pf-team').value = '';
    await loadTeamsForLocation(loc);
  };

  $('btn-start').onclick = () => startQuestionFlow();
  $('btn-leaderboards').onclick = () => openLeaderboards();
  $('btn-signout').onclick = () => auth.signOut();

  $('btn-q-back').onclick = () => {
    clearTimer();
    showPanel('hub');
  };

  $('btn-result-lb').onclick = () => openLeaderboards();
  $('btn-result-hub').onclick = () => showPanel('hub');

  $('btn-lb-back').onclick = () => showPanel('hub');

  document.querySelectorAll('.daily-lb-tab').forEach((btn) => {
    btn.onclick = async () => {
      state.lbTab = btn.getAttribute('data-lb');
      document.querySelectorAll('.daily-lb-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      await renderLeaderboardTab();
    };
  });
}

async function boot() {
  try {
    wireEvents();
  } catch (e) {
    setStatus('Chyba rozhrania: ' + (e.message || ''));
    return;
  }
  try {
    await auth.getRedirectResult();
  } catch (e) {
    setStatus(e.message || 'Chyba po presmerovaní z Google.');
  }

  auth.onAuthStateChanged(async (user) => {
    state.user = user;
    if (!user) {
      showPanel('auth');
      return;
    }
    await refreshUIForUser();
  });
}

boot();
