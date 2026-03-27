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

/** Nainštalovaná PWA / iOS „Add to Home“ – iný úložný kontext ako karta v Chrome; forced long polling tam často rozbije spojenie. */
function isLikelyInstalledPwa() {
  try {
    if (typeof window === 'undefined') return false;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (!window.matchMedia) return false;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    return false;
  } catch (e) {
    return false;
  }
}

const auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
const db = firebase.firestore();
try {
  const mode = window.QB_FIRESTORE_LONG_POLL;
  if (mode !== 'off' && mode !== 'none') {
    if (mode === 'force') {
      db.settings({ experimentalForceLongPolling: true, merge: true });
    } else if (mode === 'auto') {
      db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
    } else if (isLikelyInstalledPwa()) {
      db.settings({ experimentalAutoDetectLongPolling: true, merge: true });
    } else {
      db.settings({ experimentalForceLongPolling: true, merge: true });
    }
  }
} catch (e) {
  /* merge alebo settings nie je v danej verzii / už boli požiadavky */
}
db.enableNetwork().catch(() => {});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    db.enableNetwork().catch(() => {});
  });
}
const FieldValue = firebase.firestore.FieldValue;
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const TZ = 'Europe/Bratislava';
const LEADERBOARD_MAX = 50;
/** Poradie záložiek rebríčkov – musí sedieť s data-lb v HTML (swipe vľavo = ďalšia) */
const LB_TAB_ORDER = ['day', 'week', 'month', 'streak', 'badges', 'myteam'];
const DEFAULT_TIMER_SEC = 15;
/** Rovnaký rozsah ako v Android appke (avatar_0 … avatar_230 v drawable). */
const AVATAR_MAX_INDEX = 230;

let avatarPickerBuilt = false;

function getAvatarBase() {
  const u = typeof window.QB_AVATAR_BASE === 'string' && window.QB_AVATAR_BASE.trim();
  return u ? u.replace(/\/?$/, '/') : '/drawable/';
}

function bindAvatarImg(img, index) {
  if (!img) return;
  const n = Math.max(0, Math.min(AVATAR_MAX_INDEX, index));
  const base = getAvatarBase();
  const png = `${base}avatar_${n}.png`;
  img.alt = `Avatar ${n}`;
  img.onerror = () => {
    img.onerror = null;
    img.src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect fill="#e8e9ef" width="64" height="64"/><text x="32" y="38" text-anchor="middle" font-size="14" font-weight="700" fill="#222454">${n}</text></svg>`
      );
  };
  img.src = png;
}

function buildAvatarPicker() {
  const wrap = $('pf-avatar-picker');
  if (!wrap || avatarPickerBuilt) return;
  for (let i = 0; i <= AVATAR_MAX_INDEX; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'daily-avatar-btn';
    btn.dataset.avatarIndex = String(i);
    btn.setAttribute('aria-label', `Avatar ${i}`);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    bindAvatarImg(img, i);
    btn.appendChild(img);
    btn.addEventListener('click', () => selectAvatarIndex(i));
    wrap.appendChild(btn);
  }
  avatarPickerBuilt = true;
  syncAvatarPickerSelection();
}

function syncAvatarPickerSelection() {
  if (!avatarPickerBuilt) return;
  const v = Math.max(0, Math.min(AVATAR_MAX_INDEX, parseInt($('pf-avatar-index').value, 10) || 0));
  document.querySelectorAll('.daily-avatar-btn').forEach((btn) => {
    const idx = parseInt(btn.dataset.avatarIndex, 10);
    btn.classList.toggle('daily-avatar-btn--selected', idx === v);
  });
}

function selectAvatarIndex(i) {
  const n = Math.max(0, Math.min(AVATAR_MAX_INDEX, i));
  $('pf-avatar-index').value = String(n);
  state.profile.avatar_index = n;
  syncAvatarPickerSelection();
  bindAvatarImg($('pf-avatar-preview'), n);
}

function updateHubProfileAvatar() {
  bindAvatarImg($('hub-profile-avatar'), state.profile.avatar_index || 0);
}

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
  locationsLoaded: false,
  /** @type {{ type: string, streakDays?: number }[]} Rovnaká logika ako Android pendingBadgeCongrats */
  pendingBadgeCongrats: [],
  /** Posledné načítané hodnoty z badges/{uid} (pre uloženie po zatvorení dialógu) */
  lastBadgesSnapshot: null
};

function setStatus(msg) {
  const el = $('daily-status');
  if (el) el.textContent = msg || '';
}

/** Ľudsky zrozumiteľná správa pri Firestore „offline“ (časté v Android PWA, hoci Wi‑Fi ide). */
function userVisibleFirestoreError(e, emptyFallback) {
  const raw = (e && e.message) || '';
  const code = e && e.code;
  if (code === 'unavailable' || /offline/i.test(raw)) {
    return (
      'Spojenie s databázou zlyhalo (aplikácia je v režime offline). Skús obnoviť stránku. ' +
      'Ak používaš skratku z domovskej obrazovky, otvor stránku aj v Chrome – ak tam funguje, odstráň starú skratku a pridaj stránku znova (PWA má oddelené úložisko).'
    );
  }
  return raw || emptyFallback || 'načítanie';
}

function showPanel(name) {
  if (name === 'question') {
    hideBadgeCongratsOverlay();
  }
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

function badgeStorageKey(uid, suffix) {
  return `qb_den_ot_${uid}_${suffix}`;
}

function parseBadgesDoc(data) {
  const d = data && typeof data === 'object' ? data : {};
  const n = (x) => {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    daily_wins: n(d.daily_wins),
    weekly_wins: n(d.weekly_wins),
    monthly_wins: n(d.monthly_wins),
    current_streak: n(d.current_streak),
    best_streak: n(d.best_streak)
  };
}

/**
 * Rovnaká logika ako QuizViewModel.checkNewBadgeCongrats – prvý beh len inicializuje „posledné“ hodnoty bez gratulácie.
 */
function checkNewBadgeCongrats(badges, uid) {
  const initKey = badgeStorageKey(uid, 'bc_init');
  if (!localStorage.getItem(initKey)) {
    localStorage.setItem(initKey, '1');
    localStorage.setItem(badgeStorageKey(uid, 'bc_last_d'), String(badges.daily_wins));
    localStorage.setItem(badgeStorageKey(uid, 'bc_last_w'), String(badges.weekly_wins));
    localStorage.setItem(badgeStorageKey(uid, 'bc_last_m'), String(badges.monthly_wins));
    localStorage.setItem(badgeStorageKey(uid, 'bc_last_bs'), String(badges.best_streak));
    return;
  }
  const lastD = parseInt(localStorage.getItem(badgeStorageKey(uid, 'bc_last_d')), 10) || 0;
  const lastW = parseInt(localStorage.getItem(badgeStorageKey(uid, 'bc_last_w')), 10) || 0;
  const lastM = parseInt(localStorage.getItem(badgeStorageKey(uid, 'bc_last_m')), 10) || 0;
  const lastBs = parseInt(localStorage.getItem(badgeStorageKey(uid, 'bc_last_bs')), 10) || 0;
  const newOnes = [];
  if (badges.daily_wins > lastD) newOnes.push({ type: 'daily' });
  if (badges.weekly_wins > lastW) newOnes.push({ type: 'weekly' });
  if (badges.monthly_wins > lastM) newOnes.push({ type: 'monthly' });
  if (badges.best_streak > lastBs && badges.best_streak > 0) {
    newOnes.push({ type: 'streak', streakDays: badges.best_streak });
  }
  if (newOnes.length > 0) {
    state.pendingBadgeCongrats = newOnes;
  }
}

function markBadgeCongratsDismissed(type) {
  if (!type) {
    hideBadgeCongratsOverlay();
    return;
  }
  const uid = state.user?.uid;
  const b = state.lastBadgesSnapshot;
  if (!uid || !b) {
    hideBadgeCongratsOverlay();
    return;
  }
  switch (type) {
    case 'daily':
      localStorage.setItem(badgeStorageKey(uid, 'bc_last_d'), String(b.daily_wins));
      break;
    case 'weekly':
      localStorage.setItem(badgeStorageKey(uid, 'bc_last_w'), String(b.weekly_wins));
      break;
    case 'monthly':
      localStorage.setItem(badgeStorageKey(uid, 'bc_last_m'), String(b.monthly_wins));
      break;
    case 'streak':
      localStorage.setItem(badgeStorageKey(uid, 'bc_last_bs'), String(b.best_streak));
      break;
    default:
      break;
  }
  state.pendingBadgeCongrats = state.pendingBadgeCongrats.slice(1);
  hideBadgeCongratsOverlay();
  tryShowBadgeCongratsModal();
}

function getDrawableBase() {
  return getAvatarBase();
}

/** Obrázky ako v appke: drawable/odznaky/day_en … + fallback badge_day … */
function bindBadgeCongratsImg(img, badgeType) {
  if (!img) return;
  const base = getDrawableBase().replace(/\/?$/, '/');
  const odznakName =
    badgeType === 'daily'
      ? 'day_en'
      : badgeType === 'weekly'
        ? 'week_en'
        : badgeType === 'monthly'
          ? 'month_en'
          : badgeType === 'streak'
            ? 'best_strike'
            : 'day_en';
  const fallbackStem =
    badgeType === 'daily'
      ? 'badge_day'
      : badgeType === 'weekly'
        ? 'badge_week'
        : badgeType === 'monthly'
          ? 'badge_month'
          : badgeType === 'streak'
            ? 'badge_best_strike'
            : 'badge_day';
  const oPng = `${base}odznaky/${odznakName}.png`;
  const fPng = `${base}${fallbackStem}.png`;
  img.alt = 'Odznak';
  let step = 0;
  img.onerror = () => {
    step += 1;
    if (step === 1) img.src = fPng;
    else {
      img.onerror = null;
      img.src =
        'data:image/svg+xml,' +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><rect fill="#e8e9ef" rx="16" width="140" height="140"/><text x="70" y="78" text-anchor="middle" font-size="13" font-weight="700" fill="#222454">Odznak</text></svg>`
        );
    }
  };
  img.src = oPng;
}

function hideBadgeCongratsOverlay() {
  const el = $('badge-congrats-overlay');
  if (el) {
    el.classList.add('hidden');
    delete el.dataset.currentType;
  }
}

function tryShowBadgeCongratsModal() {
  if (state.activePanel === 'question') return;
  const overlay = $('badge-congrats-overlay');
  if (!overlay || !overlay.classList.contains('hidden')) return;
  const first = state.pendingBadgeCongrats[0];
  if (!first) return;
  overlay.dataset.currentType = first.type;
  bindBadgeCongratsImg($('badge-congrats-img'), first.type);
  overlay.classList.remove('hidden');
  const btn = $('badge-congrats-close');
  if (btn) btn.focus();
}

async function loadBadgesForCongratsAndMaybeShow() {
  const uid = state.user?.uid;
  if (!uid || !profileComplete()) return;
  try {
    const snap = await db.collection('badges').doc(uid).get();
    const d = snap.exists ? snap.data() : {};
    const badges = parseBadgesDoc(d);
    state.lastBadgesSnapshot = badges;
    checkNewBadgeCongrats(badges, uid);
    tryShowBadgeCongratsModal();
  } catch (e) {
    console.warn('[Daily] badges', e);
  }
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
        avatar_index: Math.max(0, Math.min(AVATAR_MAX_INDEX, p.avatar_index || 0))
      },
      { merge: true }
    );
}

function fillProfileBasics() {
  $('pf-nickname').value = state.profile.nickname;
  $('pf-fullname').value = state.profile.full_name;
  $('pf-location').value = state.profile.location;
  const idx = Math.max(0, Math.min(AVATAR_MAX_INDEX, Number(state.profile.avatar_index) || 0));
  state.profile.avatar_index = idx;
  $('pf-avatar-index').value = String(idx);
  bindAvatarImg($('pf-avatar-preview'), idx);
  buildAvatarPicker();
  syncAvatarPickerSelection();
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

function updateHubStartButton() {
  const btn = $('btn-start');
  if (!btn) return;
  if (state.answeredToday) {
    btn.disabled = true;
    btn.textContent = 'Dnes už si odpovedal.';
  } else {
    btn.disabled = false;
    btn.textContent = 'Odpovedať na dennú otázku';
  }
}

/** Po návrate na hub vždy znova načítať stav odpovede (inak ostane staré tlačidlo po odoslaní otázky). */
async function syncHubAnswerState() {
  const uid = state.user?.uid;
  if (!uid) return;
  state.answeredToday = await checkAnsweredToday(uid);
  updateHubStartButton();
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
  const submitBtn = $('btn-q-submit');
  if (submitBtn) {
    submitBtn.disabled = state.answerLocked || !state.selectedLetter;
  }
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
    avatar_index: Math.max(0, Math.min(AVATAR_MAX_INDEX, state.profile.avatar_index || 0)),
    timestamp: FieldValue.serverTimestamp()
  };
  db.collection('daily_submissions')
    .doc(`${today}_${uid}`)
    .set(data)
    .then(() => {
      state.answeredToday = true;
      updateHubStartButton();
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
    setStatus('Dnes už si odpovedal.');
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
    $('question-error').textContent = userVisibleFirestoreError(e, 'Nepodarilo sa načítať otázku.');
  }
}

/** Po await Firestore: neprepisovať DOM, ak už používateľ prepol záložku alebo odišiel z panelu. */
function lbLeaderboardRenderStillValid(forTab) {
  if (state.lbTab !== forTab) return false;
  const p = $('panel-leaderboards');
  return !!(p && !p.classList.contains('hidden'));
}

async function renderLeaderboardTab(forTab) {
  const content = $('lb-content');
  const ch = $('lb-champions');
  if (!content || !ch) return;
  ch.innerHTML = '';
  content.textContent = 'Načítavam…';

  try {
    if (forTab === 'day') {
      const [todayDoc, yestDoc] = await Promise.all([
        db.collection('leaderboards').doc('daily_today').get(),
        db.collection('leaderboards').doc('daily_yesterday').get()
      ]);
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      const y = parseChampion(yestDoc);
      if (y) {
        ch.innerHTML = `<div class="daily-champ-row"><span class="daily-champ-label">Víťaz včera</span><span class="daily-champ-value">${escapeHtml(y.nickname)} <span class="daily-champ-sep">·</span> <span class="daily-champ-pts">${y.points} b.</span></span></div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(todayDoc), true);
    } else if (forTab === 'week') {
      const [wDoc, pDoc] = await Promise.all([
        db.collection('leaderboards').doc('weekly_stats').get(),
        db.collection('leaderboards').doc('weekly_previous').get()
      ]);
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      const prev = parseChampion(pDoc);
      if (prev) {
        ch.innerHTML = `<div class="daily-champ-row"><span class="daily-champ-label">Víťaz minulého týždňa</span><span class="daily-champ-value">${escapeHtml(prev.nickname)}${prev.points != null ? ` <span class="daily-champ-sep">·</span> <span class="daily-champ-pts">${prev.points} b.</span>` : ''}</span></div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(wDoc), true);
    } else if (forTab === 'month') {
      const [mDoc, pDoc] = await Promise.all([
        db.collection('leaderboards').doc('monthly_stats').get(),
        db.collection('leaderboards').doc('monthly_previous').get()
      ]);
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      const prev = parseChampion(pDoc);
      if (prev) {
        ch.innerHTML = `<div class="daily-champ-row"><span class="daily-champ-label">Víťaz minulého mesiaca</span><span class="daily-champ-value">${escapeHtml(prev.nickname)}${prev.points != null ? ` <span class="daily-champ-sep">·</span> <span class="daily-champ-pts">${prev.points} b.</span>` : ''}</span></div>`;
      }
      content.innerHTML = renderEntryList(parseLeaderboardEntries(mDoc), true);
    } else if (forTab === 'streak') {
      const sDoc = await db.collection('leaderboards').doc('streak_stats').get();
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      content.innerHTML = renderStreakList(parseStreakEntries(sDoc));
    } else if (forTab === 'badges') {
      const bDoc = await db.collection('badges').doc(state.user.uid).get();
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      const d = bDoc.exists ? bDoc.data() : {};
      content.innerHTML = renderBadges(d);
    } else if (forTab === 'myteam') {
      const loc = state.profile.location.trim();
      if (!loc) {
        if (!lbLeaderboardRenderStillValid(forTab)) return;
        content.innerHTML = '<p>Nemáš vyplnenú lokáciu v profile.</p>';
        return;
      }
      const lDoc = await db.collection('locations').doc(loc).get();
      if (!lbLeaderboardRenderStillValid(forTab)) return;
      if (!lDoc.exists) {
        content.innerHTML = '<p>Pre tvoju lokáciu nie sú dáta.</p>';
        return;
      }
      const raw = lDoc.data().seasonRanking;
      content.innerHTML = renderMyTeam(raw, state.profile.team);
    }
  } catch (e) {
    if (!lbLeaderboardRenderStillValid(forTab)) return;
    content.textContent = 'Chyba: ' + userVisibleFirestoreError(e);
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function showProfilePanel(opts) {
  const fromHub = opts && opts.fromHub;
  if (fromHub && state.user) await loadUserProfileDoc(state.user.uid);
  if (!state.locationsLoaded) await loadLocationsSelect();
  fillProfileBasics();
  await loadTeamsForLocation($('pf-location').value || state.profile.location);
  $('pf-team').value = state.profile.team;
  const back = $('btn-profile-back');
  if (back) back.classList.toggle('hidden', !fromHub);
  const head = $('profile-heading');
  if (head) head.textContent = fromHub ? 'Upraviť profil' : 'Profil';
  const apw = $('pf-avatar-picker-wrap');
  if (apw) apw.classList.add('hidden');
  const tgl = $('btn-toggle-avatar-picker');
  if (tgl) tgl.textContent = 'Vybrať avatara';
  showPanel('profile');
}

function renderHubProfileDetails() {
  const wrap = $('hub-profile-details');
  if (!wrap) return;
  const p = state.profile;
  const rows = [
    ['Prezývka', p.nickname || ''],
    ['Celé meno', p.full_name || ''],
    ['Lokácia', p.location || ''],
    ['Tím', p.team || '']
  ];
  wrap.innerHTML = rows
    .map(([k, v]) => {
      const val = v.trim() ? escapeHtml(v) : '<span class="daily-profile-missing">—</span>';
      return `<div class="daily-profile-row"><span class="daily-profile-label">${escapeHtml(k)}</span><span class="daily-profile-value">${val}</span></div>`;
    })
    .join('');
  updateHubProfileAvatar();
}

function renderEntryList(entries, showTime) {
  if (!entries.length) return '<p class="daily-lb-empty">Rebríček je prázdny alebo sa ešte prepočítava.</p>';
  return entries
    .map(
      (e) => `
    <div class="daily-lb-row">
      <span class="daily-lb-rank">${e.rank}</span>
      <span class="daily-lb-name">${escapeHtml(e.nickname)}</span>
      <span class="daily-lb-meta"><span class="daily-lb-pts">${e.points} b.</span>${showTime ? `<span class="daily-lb-sep">·</span><span class="daily-lb-time">${(e.timeMs / 1000).toFixed(1)} s</span>` : ''}</span>
    </div>`
    )
    .join('');
}

function renderStreakList(entries) {
  if (!entries.length) return '<p class="daily-lb-empty">Žiadne dáta.</p>';
  return entries
    .map(
      (e) => `
    <div class="daily-lb-row">
      <span class="daily-lb-rank">${e.rank}</span>
      <span class="daily-lb-name">${escapeHtml(e.nickname)}</span>
      <span class="daily-lb-meta"><span class="daily-lb-streak">${e.bestStreakDays} dní</span></span>
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

function renderMyTeam(raw, profileTeamName) {
  if (!Array.isArray(raw) || !raw.length) return '<p class="daily-lb-empty">Sezónne poradie tímov zatiaľ nie je k dispozícii.</p>';
  const myTeamNorm = (profileTeamName || '').trim().toLowerCase();
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
  if (!rows.length) return '<p class="daily-lb-empty">Žiadne tímy v poradí.</p>';
  return rows
    .map((e, i) => {
      const isMine = myTeamNorm.length > 0 && e.team.toLowerCase() === myTeamNorm;
      const rowClass = isMine ? 'daily-lb-row daily-myteam-row--mine' : 'daily-lb-row';
      return `
    <div class="${rowClass}">
      <span class="daily-lb-rank">${i + 1}</span>
      <span class="daily-lb-name">${escapeHtml(e.team)}</span>
      <span class="daily-lb-meta"><span class="daily-lb-pts">${e.pts} b.</span></span>
    </div>`;
    })
    .join('');
}

function scrollActiveLbTabIntoView() {
  requestAnimationFrame(() => {
    const active = document.querySelector('#panel-leaderboards .daily-lb-tab.active');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  });
}

/** Stav potiahnutia rebríčka (iOS PWA občas neodošle touchend – reset pri návrate na stránku). */
let lbSwipeG = null;
let lbSwipePtr = null;

function resetLeaderboardTouchState() {
  lbSwipeG = null;
  lbSwipePtr = null;
}

async function switchLeaderboardTab(lbKey) {
  if (!lbKey || !LB_TAB_ORDER.includes(lbKey)) return;
  state.lbTab = lbKey;
  document.querySelectorAll('.daily-lb-tab').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-lb') === lbKey);
  });
  await renderLeaderboardTab(lbKey);
  if (state.lbTab === lbKey && $('panel-leaderboards') && !$('panel-leaderboards').classList.contains('hidden')) {
    scrollActiveLbTabIntoView();
  }
  void loadBadgesForCongratsAndMaybeShow();
}

function initLeaderboardSwipe() {
  const wrap = $('daily-lb-swipe');
  if (!wrap || wrap.dataset.lbSwipeInit) return;
  wrap.dataset.lbSwipeInit = '1';

  /** Min. posun pre prepnutie záložky (po celej oblasti pod hornými tlačidlami – aj priamo na riadkoch tabuľky). */
  const minDX = 48;
  /** Pri uzamknutí horizontálu: scroll zoznamu sa zastaví, aby „nežral“ potiahnutie. */
  const ratioLock = 1.22;
  const lockSlopPx = 10;
  const ratioEndLoose = 1.1;
  const ratioEndLocked = 1.02;

  function leaderboardsVisible() {
    const p = $('panel-leaderboards');
    return p && !p.classList.contains('hidden');
  }

  function trySwitchTab(dx, dy, wasHorizontalLocked) {
    if (!leaderboardsVisible()) return;
    const ratio = wasHorizontalLocked ? ratioEndLocked : ratioEndLoose;
    if (Math.abs(dx) < minDX) return;
    if (Math.abs(dx) < Math.abs(dy) * ratio) return;

    const idx = LB_TAB_ORDER.indexOf(state.lbTab);
    if (idx < 0) return;

    if (dx < 0) {
      if (idx < LB_TAB_ORDER.length - 1) void switchLeaderboardTab(LB_TAB_ORDER[idx + 1]);
    } else if (idx > 0) {
      void switchLeaderboardTab(LB_TAB_ORDER[idx - 1]);
    }
  }

  wrap.addEventListener(
    'touchstart',
    (e) => {
      if (!leaderboardsVisible() || e.touches.length !== 1) return;
      lbSwipeG = {
        x0: e.touches[0].clientX,
        y0: e.touches[0].clientY,
        horizontal: false,
        touch: true
      };
    },
    { capture: true, passive: true }
  );

  wrap.addEventListener(
    'touchmove',
    (e) => {
      const g = lbSwipeG;
      if (!g || !g.touch || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.horizontal) {
        if (Math.abs(dx) > lockSlopPx && Math.abs(dx) > Math.abs(dy) * ratioLock) {
          g.horizontal = true;
        }
      }
      if (g.horizontal) {
        e.preventDefault();
      }
    },
    { capture: true, passive: false }
  );

  wrap.addEventListener(
    'touchend',
    (e) => {
      const g = lbSwipeG;
      if (!g || !g.touch) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      const locked = g.horizontal;
      lbSwipeG = null;
      trySwitchTab(dx, dy, locked);
    },
    { capture: true, passive: true }
  );

  wrap.addEventListener(
    'touchcancel',
    () => {
      lbSwipeG = null;
    },
    { capture: true }
  );

  wrap.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0 || !leaderboardsVisible()) return;
      lbSwipePtr = { x0: e.clientX, y0: e.clientY, id: e.pointerId };
    },
    { capture: true }
  );

  wrap.addEventListener(
    'pointerup',
    (e) => {
      const ptr = lbSwipePtr;
      if (!ptr || e.pointerId !== ptr.id) return;
      const dx = e.clientX - ptr.x0;
      const dy = e.clientY - ptr.y0;
      lbSwipePtr = null;
      trySwitchTab(dx, dy, false);
    },
    { capture: true }
  );

  wrap.addEventListener('pointercancel', () => {
    lbSwipePtr = null;
  });

  /* iOS PWA: občas chýba touchend / zostane „visieť“ gesture po pozastavení aplikácie */
  const thawLeaderboards = () => {
    resetLeaderboardTouchState();
  };
  document.addEventListener('visibilitychange', thawLeaderboards);
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) thawLeaderboards();
  });
}

async function openLeaderboards() {
  showPanel('leaderboards');
  await switchLeaderboardTab('day');
}

async function refreshUIForUser() {
  const u = state.user;
  if (!u) {
    showPanel('auth');
    return;
  }
  setStatus('');
  try {
    await loadUserProfileDoc(u.uid);
    state.answeredToday = await checkAnsweredToday(u.uid);

    if (!profileComplete()) {
      await showProfilePanel({ fromHub: false });
      return;
    }

    showPanel('hub');
    renderHubProfileDetails();
    const mail = u.email || '';
    $('hub-greeting').textContent = `Ahoj, ${state.profile.nickname}!${mail ? ` (${mail})` : ''}`;
    updateHubStartButton();
    await loadBadgesForCongratsAndMaybeShow();
  } catch (err) {
    console.error('[Daily] refreshUIForUser', err);
    setStatus('Chyba pri načítaní účtu: ' + userVisibleFirestoreError(err, 'skús znova obnoviť stránku.'));
  }
}

function formatAuthError(e) {
  const code = e?.code || '';
  if (code === 'auth/network-request-failed') {
    return (
      'Sieťové prihlásenie zlyhalo (často blokovač reklám, VPN alebo režim súkromia). Skús ich vypnúť alebo iný prehliadač. ' +
      'Ak problém trvá: Google Cloud Console → Credentials → API kľúč pre tento web musí mať v API restrictions zapnuté aspoň „Identity Toolkit API“ a v Application restrictions buď „None“, alebo správnu webovú doménu (vrátane www).'
    );
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  ) {
    return '';
  }
  return e?.message || 'Prihlásenie zlyhalo.';
}

/**
 * Prihlásenie: predvolene popup (funguje spoľahlivejšie ako redirect na PC aj mobile).
 * Redirect len ak pred daily.js nastavíš window.QB_GOOGLE_USE_REDIRECT = true,
 * alebo ako záloha keď prehliadač popup zablokuje.
 */
async function signInGoogle() {
  setStatus('');
  if (window.QB_GOOGLE_USE_REDIRECT === true) {
    try {
      await auth.signInWithRedirect(googleProvider);
    } catch (e) {
      setStatus(formatAuthError(e));
    }
    return;
  }

  try {
    await auth.signInWithPopup(googleProvider);
  } catch (e) {
    const code = e?.code || '';
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment' ||
      code === 'auth/internal-error'
    ) {
      try {
        await auth.signInWithRedirect(googleProvider);
      } catch (e2) {
        setStatus(formatAuthError(e2));
      }
      return;
    }
    setStatus(formatAuthError(e));
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
    state.profile.avatar_index = Math.max(
      0,
      Math.min(AVATAR_MAX_INDEX, parseInt($('pf-avatar-index').value, 10) || 0)
    );
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

  $('btn-edit-profile').onclick = async () => {
    await showProfilePanel({ fromHub: true });
  };

  $('btn-profile-back').onclick = async () => {
    showPanel('hub');
    await syncHubAnswerState();
    await loadBadgesForCongratsAndMaybeShow();
  };

  $('btn-toggle-avatar-picker').onclick = () => {
    buildAvatarPicker();
    const wrap = $('pf-avatar-picker-wrap');
    const btn = $('btn-toggle-avatar-picker');
    if (!wrap || !btn) return;
    wrap.classList.toggle('hidden');
    const open = !wrap.classList.contains('hidden');
    btn.textContent = open ? 'Skryť výber avatara' : 'Vybrať avatara';
  };

  $('btn-q-back').onclick = async () => {
    clearTimer();
    showPanel('hub');
    await syncHubAnswerState();
    await loadBadgesForCongratsAndMaybeShow();
  };

  $('btn-q-submit').onclick = () => {
    if (state.answerLocked || !state.selectedLetter) return;
    submitAnswer();
  };

  $('btn-result-lb').onclick = () => openLeaderboards();
  $('btn-result-hub').onclick = async () => {
    showPanel('hub');
    await syncHubAnswerState();
    await loadBadgesForCongratsAndMaybeShow();
  };

  $('btn-lb-back').onclick = async () => {
    showPanel('hub');
    await syncHubAnswerState();
  };

  document.querySelectorAll('.daily-lb-tab').forEach((btn) => {
    btn.onclick = async () => {
      await switchLeaderboardTab(btn.getAttribute('data-lb'));
    };
  });

  initLeaderboardSwipe();

  const badgeOverlay = $('badge-congrats-overlay');
  const closeBadge = () => {
    const t = badgeOverlay?.dataset.currentType;
    markBadgeCongratsDismissed(t || '');
  };
  $('badge-congrats-close').onclick = closeBadge;
  if (badgeOverlay) {
    badgeOverlay.addEventListener('click', (ev) => {
      if (ev.target === badgeOverlay) closeBadge();
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const o = $('badge-congrats-overlay');
    if (o && !o.classList.contains('hidden')) closeBadge();
  });
}

/** Apple mobil / tablet: iPhone, iPad, iPod + iPadOS desktop UA. Zahŕňa Safari, Chrome, Firefox… na iOS (všetky používajú WebKit; UA stále obsahuje iPhone/iPad). */
function isAppleTouchDeviceForPwa() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  try {
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  } catch (e) {
    /* ignore */
  }
  return false;
}

function initApplePwaBanner() {
  if (!isAppleTouchDeviceForPwa()) return;

  if (window.navigator.standalone === true) return;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
  } catch (e) {
    /* ignore */
  }

  try {
    if (window.localStorage.getItem('qb_daily_ios_pwa_dismiss') === '1') return;
  } catch (e) {
    /* súkromné okno / blokované úložisko */
  }

  const el = document.getElementById('daily-ios-pwa-banner');
  if (!el) return;
  el.classList.remove('hidden');

  const btn = document.getElementById('daily-ios-pwa-dismiss');
  if (btn) {
    btn.addEventListener('click', () => {
      el.classList.add('hidden');
      try {
        window.localStorage.setItem('qb_daily_ios_pwa_dismiss', '1');
      } catch (e2) {
        /* ignore */
      }
    });
  }
}

async function boot() {
  try {
    await db.enableNetwork();
  } catch (e) {
    /* ignore */
  }

  try {
    wireEvents();
  } catch (e) {
    setStatus('Chyba rozhrania: ' + (e.message || ''));
    return;
  }

  initApplePwaBanner();

  const authDbg = window.QB_AUTH_DEBUG === true;

  /**
   * WebKit / iOS: ak sa onAuthStateChanged zaregistruje pred spracovaním návratu z Google,
   * prvý beh s user=null „zamrzne“ UI; getRedirectResult musí ísť pred listenerom (Firebase odporúča).
   */
  try {
    const result = await auth.getRedirectResult();
    if (authDbg) {
      if (result && result.user) {
        console.log('[Auth] getRedirectResult: OK', { uid: result.user.uid, email: result.user.email });
      } else {
        console.log(
          '[Auth] getRedirectResult: null / bez usera — pri bežnom načítaní stránky (bez návratu z Google) je to normálne, NIE je to sám o sebe dôkaz third-party cookies.'
        );
      }
    }
    if (result && result.user) {
      setStatus('');
    }
  } catch (e) {
    const code = e?.code || '';
    let msg = formatAuthError(e);
    if (code === 'auth/unauthorized-domain') {
      msg =
        'Doména stránky nie je v Firebase → Authentication → Settings → Authorized domains. Pridaj presne túto adresu (vrátane www alebo bez www).';
    } else if (code === 'auth/operation-not-allowed') {
      msg = 'V Firebase Console → Authentication → Sign-in method zapni Google.';
    }
    console.warn('[Daily] getRedirectResult', code, e);
    if (msg) setStatus(msg);
  }

  if (typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
      if (authDbg) {
        console.log('[Auth] authStateReady hotovo, aktuálny user z auth:', auth.currentUser ? auth.currentUser.uid : null);
      }
    } catch (e) {
      /* ignore */
    }
  }

  auth.onAuthStateChanged(async (user) => {
    if (authDbg) {
      console.log('[Auth] onAuthStateChanged', user ? { uid: user.uid, email: user.email, name: user.displayName } : 'žiadny');
    }
    try {
      state.user = user;
      if (!user) {
        state.pendingBadgeCongrats = [];
        state.lastBadgesSnapshot = null;
        showPanel('auth');
        return;
      }
      await refreshUIForUser();
    } catch (err) {
      console.error('[Daily] onAuthStateChanged', err);
      setStatus('Chyba prihlásenia: ' + (err.message || ''));
    }
  });

  function tryRefreshUiIfLoggedInButAuthPanel() {
    const u = auth.currentUser;
    if (!u || state.activePanel !== 'auth') return;
    state.user = u;
    refreshUIForUser().catch((err) => {
      console.error('[Daily] auth UI sync po návrate na stránku', err);
      setStatus('Chyba pri načítaní účtu: ' + userVisibleFirestoreError(err, 'skús znova obnoviť stránku.'));
    });
  }

  window.addEventListener('pageshow', () => {
    tryRefreshUiIfLoggedInButAuthPanel();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryRefreshUiIfLoggedInButAuthPanel();
  });

  setTimeout(() => tryRefreshUiIfLoggedInButAuthPanel(), 0);
}

boot();
