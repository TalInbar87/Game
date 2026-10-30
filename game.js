'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// beats: loser -> verb shown in the battle ("ROCK CRUSHES SCISSORS")
const MOVES = {
  rock:     { emoji: '✊', key: 'r', beats: { scissors: 'CRUSHES', lizard: 'CRUSHES' } },
  paper:    { emoji: '✋', key: 'p', beats: { rock: 'COVERS', spock: 'DISPROVES' } },
  scissors: { emoji: '✌️', key: 's', beats: { paper: 'CUT', lizard: 'DECAPITATE' } },
  lizard:   { emoji: '🦎', key: 'l', beats: { spock: 'POISONS', paper: 'EATS' } },
  spock:    { emoji: '🖖', key: 'v', beats: { scissors: 'SMASHES', rock: 'VAPORIZES' } },
};
// How the losing hand reacts to each verb
const VERB_FX = {
  CRUSHES: 'crush', SMASHES: 'crush', COVERS: 'cover', EATS: 'cover',
  CUT: 'cut', DECAPITATE: 'cut', POISONS: 'zap', DISPROVES: 'zap', VAPORIZES: 'zap',
};
const VARIANTS = {
  classic: { label: 'CLASSIC', moves: ['rock', 'paper', 'scissors'] },
  spock:   { label: 'LIZARD SPOCK', moves: ['rock', 'paper', 'scissors', 'lizard', 'spock'] },
};
const LEVELS = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD' };
const TARGETS = [1, 3, 5, 7];
const beats = (a, b) => Boolean(MOVES[a].beats[b]);
const PEER_PREFIX = 'rps-arcade-tal-';

/* ---------- storage (best effort) ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

/* ---------- sound ---------- */
let audio = null;
let master = null;
let muted = store.get('rps-muted', false);

// iOS: play through the silent switch (Safari 16.4+)
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* ignore */ }

function getAudio() {
  if (!audio) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audio = new AC();
    master = audio.createGain();
    master.gain.value = 0.8;
    master.connect(audio.destination);
  }
  if (audio.state !== 'running') audio.resume().catch(() => {});
  return audio;
}

// Browsers only allow audio to start inside a user gesture, so unlock on the first one.
function unlockAudio() {
  const ac = getAudio();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = ac.createBuffer(1, 1, 22050);
  src.connect(ac.destination);
  src.start(0);
  if (ac.state === 'running') ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.removeEventListener(ev, unlockAudio, true));
}
['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, true));

function beep(freq, dur = 0.08, type = 'square', vol = 0.15, when = 0) {
  if (muted) return;
  try {
    if (!getAudio()) return;
    const t = audio.currentTime + when;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  } catch { /* no audio */ }
}

const sfx = {
  select: () => beep(660, 0.07),
  nav:    () => beep(330, 0.05),
  tick:   () => beep(220, 0.12),
  shoot:  () => { beep(880, 0.18); beep(1320, 0.18, 'square', 0.1, 0.05); },
  point:  () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.12, 'square', 0.15, i * 0.08)),
  miss:   () => [330, 262, 196].forEach((f, i) => beep(f, 0.16, 'sawtooth', 0.12, i * 0.1)),
  draw:   () => beep(440, 0.25, 'triangle', 0.2),
  win:    () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => beep(f, 0.13, 'square', 0.15, i * 0.11)),
  lose:   () => [392, 330, 262, 196, 131].forEach((f, i) => beep(f, 0.2, 'sawtooth', 0.12, i * 0.15)),
  join:   () => [440, 554, 659].forEach((f, i) => beep(f, 0.08, 'square', 0.15, i * 0.07)),
  whoosh: () => [300, 500, 800].forEach((f, i) => beep(f, 0.06, 'triangle', 0.12, i * 0.04)),
  hit:    () => { beep(110, 0.22, 'sawtooth', 0.25); beep(70, 0.3, 'square', 0.2, 0.03); beep(1800, 0.05, 'square', 0.08); },
  clash:  () => { beep(1400, 0.08, 'square', 0.12); beep(1900, 0.1, 'square', 0.08, 0.06); },
};

/* ---------- player names ---------- */
const cleanName = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9 _\-!?.א-ת]/g, '').trim().slice(0, 12);
const NAME_A = ['NEON', 'PIXEL', 'TURBO', 'MEGA', 'HYPER', 'LASER', 'RETRO', 'COSMIC', 'ROBO', 'SUPER'];
const NAME_B = ['FOX', 'CAT', 'NINJA', 'WOLF', 'BEE', 'OWL', 'TIGER', 'SHARK', 'BAT', 'YETI'];
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomName = () => cleanName(pickOne(NAME_A) + ' ' + pickOne(NAME_B));

// Everyone gets a default arcade name until they type their own.
let myName = cleanName(store.get('rps-name', '')) || randomName();
store.set('rps-name', myName);
let rivalName = '';

function rivalLabel() {
  return state.mode === 'cpu' ? 'CPU' : rivalName || 'RIVAL';
}

function setTag(el, role, name) {
  el.replaceChildren();
  const r = document.createElement('div');
  r.className = 'role';
  r.textContent = '▼ ' + role;
  el.appendChild(r);
  if (name && name !== role) {
    const n = document.createElement('div');
    n.className = 'tag-name';
    n.textContent = name;
    el.appendChild(n);
  }
}

function renderNames() {
  $('#n1').textContent = 'P1 ' + myName;
  $('#n2').textContent = rivalLabel() + ' P2';
  setTag($('#t1'), 'YOU', myName);
  setTag($('#t2'), state.mode === 'cpu' ? 'CPU' : 'RIVAL', state.mode === 'cpu' ? LEVELS[state.level] : rivalLabel());
}

/* ---------- game state ---------- */
const state = {
  mode: null,          // 'cpu' | 'online'
  target: store.get('rps-target', 3),
  variant: VARIANTS[store.get('rps-variant', 'classic')] ? store.get('rps-variant', 'classic') : 'classic',
  level: LEVELS[store.get('rps-level', 'normal')] ? store.get('rps-level', 'normal') : 'normal',
  score: [0, 0],
  round: 1,
  myPick: null,
  busy: false,         // true while a round is being picked/animated
  over: false,
};

/* ---------- scenes ---------- */
function show(id) {
  $$('.scene').forEach((s) => s.classList.toggle('active', s.id === 's-' + id));
  const focus = $('#s-' + id + ' button:not([hidden]):not(.quit)');
  if (focus && matchMedia('(hover: hover)').matches) focus.focus({ preventScroll: true });
}

function setBanner(text, cls = '') {
  const b = $('#banner');
  b.className = 'banner';
  void b.offsetWidth; // restart animation
  b.className = 'banner pop ' + cls;
  b.textContent = text;
}

const activeMoves = () => VARIANTS[state.variant].moves;

function renderPicks() {
  const box = $('#picks');
  box.replaceChildren();
  box.classList.toggle('five', activeMoves().length === 5);
  activeMoves().forEach((m, i) => {
    const b = document.createElement('button');
    b.dataset.pick = m;
    b.innerHTML = '<span class="em">' + MOVES[m].emoji + '</span>' + m.toUpperCase() + '<kbd>' + (i + 1) + '</kbd>';
    box.appendChild(b);
  });
  renderRules();
}

// "✊ BEATS ✌️ 🦎" for every move, so the 5-move rules can be read at a glance
function renderRules() {
  const box = $('#rules');
  box.replaceChildren();
  box.hidden = activeMoves().length !== 5;
  if (box.hidden) return;
  const label = document.createElement('div');
  label.className = 'rules-label';
  label.textContent = 'WHO BEATS WHO';
  box.appendChild(label);
  activeMoves().forEach((m) => {
    const chip = document.createElement('div');
    chip.className = 'rule';
    chip.innerHTML = '<b>' + MOVES[m].emoji + '</b><small>BEATS</small>' +
      Object.keys(MOVES[m].beats).map((l) => MOVES[l].emoji).join(' ');
    box.appendChild(chip);
  });
}

function setVerb(text) { $('#verb').textContent = text; }

function setFighter(el, content, cls = '') {
  el.className = 'fighter ' + (el.id === 'f1' ? 'left' : 'right') + (cls ? ' ' + cls : '');
  el.innerHTML = '<span>' + content + '</span>';
}

function setStamp(i, text) {
  const st = $('#st' + i);
  st.className = 'stamp' + (text ? ' show ' + text.toLowerCase() : '');
  st.textContent = text;
}

function renderPips() {
  [0, 1].forEach((i) => {
    const box = $('#pips' + (i + 1));
    box.innerHTML = '';
    for (let n = 0; n < state.target; n++) {
      const pip = document.createElement('div');
      pip.className = 'pip' + (n < state.score[i] ? ' on' : '');
      box.appendChild(pip);
    }
  });
  $('#round').textContent = state.round;
}

function screenShake() {
  const s = $('.screen');
  s.classList.remove('hit');
  void s.offsetWidth;
  s.classList.add('hit');
}

/* ---------- match flow ---------- */
function startMatch(mode) {
  state.mode = mode;
  state.score = [0, 0];
  state.round = 1;
  state.over = false;
  renderNames();
  renderPicks();
  show('game');
  newRound();
}

function newRound() {
  state.myPick = null;
  state.busy = false;
  renderPips();
  setFighter($('#f1'), '❔');
  setFighter($('#f2'), '❔');
  setStamp(1, '');
  setStamp(2, '');
  setVerb('');
  $('#picks').hidden = false;
  $('#endgame').hidden = true;
  $$('#picks button').forEach((b) => { b.disabled = false; b.classList.remove('chosen'); });
  setBanner('CHOOSE!', 'flash');
  if (state.mode === 'online' && net.commits[state.round]) showRivalReady();
}

function pick(move) {
  if (state.busy || state.over || !activeMoves().includes(move)) return;
  state.busy = true;
  state.myPick = move;
  sfx.select();
  $$('#picks button').forEach((b) => {
    b.disabled = true;
    b.classList.toggle('chosen', b.dataset.pick === move);
  });
  setFighter($('#f1'), MOVES[move].emoji);

  if (state.mode === 'cpu') {
    resolveRound(move, cpuMove());
  } else {
    setBanner('WAITING...', '');
    net.commit(move);
  }
}

/* ---------- CPU ----------
   EASY:   pure random.
   NORMAL: sometimes counters your most-used recent move.
   HARD:   learns your patterns (what you play after your last one or two moves)
           and counters the prediction most of the time. */
const moveLogs = { classic: [], spock: [] };
const counterOf = (m) => pickOne(activeMoves().filter((c) => beats(c, m)));

function favouriteMove(log) {
  const counts = {};
  log.slice(-8).forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
}

function predictNext(log) {
  const n = log.length;
  if (n < 3) return null;
  const score = {};
  const add = (m, w) => { score[m] = (score[m] || 0) + w; };
  for (let i = 1; i < n; i++) {
    const recency = 1 + i / n;
    if (log[i - 1] === log[n - 1]) add(log[i], recency);
    if (i >= 2 && log[i - 2] === log[n - 2] && log[i - 1] === log[n - 1]) add(log[i], 2 * recency);
  }
  log.slice(-10).forEach((m) => add(m, 0.3));
  return Object.keys(score).sort((a, b) => score[b] - score[a])[0];
}

function cpuMove() {
  const log = moveLogs[state.variant];
  if (state.level === 'normal' && log.length >= 3 && Math.random() < 0.35) return counterOf(favouriteMove(log));
  if (state.level === 'hard') {
    const guess = predictNext(log);
    if (guess && Math.random() < 0.7) return counterOf(guess);
  }
  return pickOne(activeMoves());
}

function burst(slot, colors) {
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('i');
    p.className = 'spark';
    const a = Math.random() * Math.PI * 2;
    const d = 50 + Math.random() * 70;
    p.style.setProperty('--x', Math.cos(a) * d + 'px');
    p.style.setProperty('--y', Math.sin(a) * d + 'px');
    p.style.background = pickOne(colors);
    slot.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

// Winner lunges at the loser; the loser reacts according to the verb.
async function battle(outcome, mine, theirs) {
  const f1 = $('#f1');
  const f2 = $('#f2');
  const gap = f2.getBoundingClientRect().left - f1.getBoundingClientRect().left;
  await sleep(350);

  if (outcome === 0) {
    f1.style.setProperty('--dx', gap * 0.3 + 'px');
    f2.style.setProperty('--dx', -gap * 0.3 + 'px');
    f1.classList.add('clash');
    f2.classList.add('clash');
    sfx.whoosh();
    await sleep(250);
    sfx.clash();
    burst($('.vs'), ['#ffe14d', '#ffffff']);
    await sleep(350);
    return;
  }

  const [atk, def, w, l] = outcome === 1 ? [f1, f2, mine, theirs] : [f2, f1, theirs, mine];
  const verb = MOVES[w].beats[l];
  atk.style.setProperty('--dx', (atk === f1 ? gap : -gap) * 0.55 + 'px');
  atk.classList.add('attack');
  sfx.whoosh();
  await sleep(300); // impact
  def.classList.add('hit', 'fx-' + VERB_FX[verb]);
  burst(def.parentElement, ['#ff3b3b', '#ffe14d', '#ffffff', '#ff2bd6']);
  sfx.hit();
  screenShake();
  setVerb(w.toUpperCase() + ' ' + verb + ' ' + l.toUpperCase() + '!');
  await sleep(450);
}

async function resolveRound(mine, theirs) {
  if (state.mode === 'cpu') moveLogs[state.variant].push(mine);
  const f1 = $('#f1');
  const f2 = $('#f2');

  // ROCK... PAPER... SCISSORS... SHOOT!
  setFighter(f1, '✊', 'shake');
  setFighter(f2, '✊', 'shake');
  for (const word of ['ROCK...', 'PAPER...', 'SCISSORS...']) {
    setBanner(word);
    sfx.tick();
    await sleep(420);
  }
  setBanner('SHOOT!', 'flash');
  sfx.shoot();
  screenShake();

  const outcome = mine === theirs ? 0 : beats(mine, theirs) ? 1 : -1;
  setFighter(f1, MOVES[mine].emoji);
  setFighter(f2, MOVES[theirs].emoji);
  await battle(outcome, mine, theirs);
  if (state.mode === null) return; // left mid-animation

  // keep the loser's battle damage (fx-*) while switching to win/lose styling
  const fx = (el) => [...el.classList].filter((c) => c.startsWith('fx-')).join(' ');
  setFighter(f1, MOVES[mine].emoji, [outcome === 1 ? 'win' : outcome === -1 ? 'lose' : '', fx(f1)].join(' ').trim());
  setFighter(f2, MOVES[theirs].emoji, [outcome === -1 ? 'win' : outcome === 1 ? 'lose' : '', fx(f2)].join(' ').trim());
  setStamp(1, outcome === 1 ? 'WIN' : outcome === -1 ? 'LOSE' : 'DRAW');
  setStamp(2, outcome === -1 ? 'WIN' : outcome === 1 ? 'LOSE' : 'DRAW');

  if (outcome === 1) { state.score[0]++; setBanner('YOU WIN!', 'me'); sfx.point(); }
  else if (outcome === -1) { state.score[1]++; setBanner(rivalLabel() + ' WINS!', 'rival'); sfx.miss(); }
  else { setBanner('DRAW!'); sfx.draw(); }
  renderPips();

  const winner = state.score.findIndex((s) => s >= state.target);
  await sleep(2000); // keep the round result on screen
  if (winner !== -1) return endMatch(winner === 0);
  if (state.mode === null || state.over) return; // left mid-animation
  state.round++;
  newRound();
}

function endMatch(iWon) {
  state.over = true;
  state.busy = false;
  $('#picks').hidden = true;
  $('#endgame').hidden = false;
  $('#btn-rematch').disabled = false;
  $('#btn-rematch').textContent = 'REMATCH';
  if (iWon) {
    setBanner(state.mode === 'cpu' ? 'YOU WIN!' : 'VICTORY!', 'good flash');
    sfx.win();
  } else {
    setBanner('GAME OVER', 'bad');
    sfx.lose();
  }
  recordResult(state.mode, iWon);
}

/* Your match record, kept per mode: { w, l, streak, best } */
function getStats(mode) {
  const old = mode === 'cpu' ? { streak: store.get('rps-streak', 0), best: store.get('rps-best', 0) } : {};
  return { w: 0, l: 0, streak: 0, best: 0, ...old, ...store.get('rps-stats-' + mode, {}) };
}

function recordResult(mode, iWon) {
  const st = getStats(mode);
  if (iWon) { st.w++; st.streak++; } else { st.l++; st.streak = 0; }
  st.best = Math.max(st.best, st.streak);
  store.set('rps-stats-' + mode, st);
  updateHiscore();
}

function updateHiscore() {
  const cpu = getStats('cpu');
  const online = getStats('online');
  $('#rec-cpu').textContent = cpu.w + 'W - ' + cpu.l + 'L';
  $('#rec-online').textContent = online.w + 'W - ' + online.l + 'L';
  $('#rec-streak').textContent = cpu.streak + ' (BEST ' + cpu.best + ')';
}

function rematch() {
  if (state.mode === 'cpu') return startMatch('cpu');
  if (!net.conn || !net.conn.open) return;
  net.wantRematch[0] = true;
  net.send({ t: 'rematch' });
  $('#btn-rematch').disabled = true;
  $('#btn-rematch').textContent = 'WAITING...';
  net.maybeRematch();
}

function quitToTitle() {
  state.mode = null;
  state.variant = store.get('rps-variant', 'classic'); // undo a host's override
  renderSettings();
  state.over = true;
  net.leave();
  resetLobby();
  updateHiscore();
  show('title');
}

/* ---------- online (PeerJS / WebRTC, commit-reveal so nobody can peek) ---------- */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

const net = {
  peer: null,
  conn: null,
  isHost: false,
  mine: {},      // round -> { move, nonce, revealed }
  commits: {},   // round -> rival's hash
  reveals: {},   // round -> rival's verified move
  resolved: {},  // round -> true
  wantRematch: [false, false],

  resetRounds() {
    this.mine = {}; this.commits = {}; this.reveals = {}; this.resolved = {};
    this.wantRematch = [false, false];
  },

  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); },

  async commit(move) {
    const r = state.round;
    const nonce = randomHex(16);
    this.mine[r] = { move, nonce, revealed: false };
    this.send({ t: 'commit', r, h: await sha256(r + ':' + move + ':' + nonce) });
    this.tryReveal(r);
  },

  tryReveal(r) {
    const m = this.mine[r];
    if (m && !m.revealed && this.commits[r]) {
      m.revealed = true;
      this.send({ t: 'reveal', r, move: m.move, nonce: m.nonce });
    }
    this.tryResolve(r);
  },

  tryResolve(r) {
    if (r !== state.round || this.resolved[r]) return;
    const m = this.mine[r];
    if (m && m.revealed && this.reveals[r]) {
      this.resolved[r] = true;
      resolveRound(m.move, this.reveals[r]);
    }
  },

  async onData(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'start':
        if (TARGETS.includes(d.target)) state.target = d.target;
        if (VARIANTS[d.variant]) state.variant = d.variant; // host's game type applies
        rivalName = cleanName(d.name);
        this.send({ t: 'name', name: myName });
        this.resetRounds();
        sfx.join();
        startMatch('online');
        break;
      case 'name':
        rivalName = cleanName(d.name);
        if (state.mode === 'online') renderNames();
        break;
      case 'commit':
        if (typeof d.h !== 'string' || this.commits[d.r]) return;
        this.commits[d.r] = d.h;
        if (d.r === state.round && !state.over) showRivalReady();
        this.tryReveal(d.r);
        break;
      case 'reveal': {
        if (!activeMoves().includes(d.move) || !this.commits[d.r] || this.reveals[d.r]) return;
        const ok = (await sha256(d.r + ':' + d.move + ':' + d.nonce)) === this.commits[d.r];
        if (!ok) { setBanner('CHEATER DETECTED!', 'bad'); return; }
        this.reveals[d.r] = d.move;
        this.tryResolve(d.r);
        break;
      }
      case 'rematch':
        this.wantRematch[1] = true;
        if (state.over) setBanner('RIVAL WANTS REMATCH!', 'flash');
        this.maybeRematch();
        break;
    }
  },

  maybeRematch() {
    if (this.wantRematch[0] && this.wantRematch[1]) {
      this.resetRounds();
      sfx.join();
      startMatch('online');
    }
  },

  wire(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.send({ t: 'name', name: myName });
      if (this.isHost) {
        this.resetRounds();
        this.send({ t: 'start', target: state.target, variant: state.variant, name: myName });
        sfx.join();
        startMatch('online');
      }
    });
    conn.on('data', (d) => this.onData(d));
    conn.on('close', () => this.onRivalLeft());
    conn.on('error', () => this.onRivalLeft());
  },

  onRivalLeft() {
    if (state.mode !== 'online') return;
    state.over = true;
    state.busy = false;
    $('#picks').hidden = true;
    $('#endgame').hidden = false;
    $('#btn-rematch').disabled = true;
    $('#btn-rematch').textContent = 'REMATCH';
    setBanner('RIVAL LEFT', 'bad');
    sfx.lose();
  },

  ensurePeerLib() {
    if (typeof Peer === 'undefined') {
      status('ONLINE MODE UNAVAILABLE (NETWORK LIBRARY BLOCKED?)');
      return false;
    }
    return true;
  },

  host(attempt = 0) {
    if (!this.ensurePeerLib()) return;
    this.leave();
    this.isHost = true;
    const code = genCode();
    status('CONNECTING...');
    this.peer = new Peer(PEER_PREFIX + code);
    this.peer.on('open', () => {
      status('');
      $('#lobby-menu').hidden = true;
      $('#lobby-wait').hidden = false;
      $('#room-code').textContent = code;
    });
    this.peer.on('connection', (c) => {
      if (this.conn && this.conn.open) { c.on('open', () => c.close()); return; }
      this.wire(c);
    });
    this.peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && attempt < 3) return this.host(attempt + 1);
      status('CONNECTION ERROR: ' + (e.type || 'UNKNOWN').toUpperCase());
    });
  },

  join(code) {
    if (!this.ensurePeerLib()) return;
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { status('ENTER A 5-CHARACTER CODE'); return; }
    this.leave();
    this.isHost = false;
    status('JOINING ' + code + '...');
    this.peer = new Peer();
    this.peer.on('open', () => this.wire(this.peer.connect(PEER_PREFIX + code, { reliable: true })));
    this.peer.on('error', (e) => {
      status(e.type === 'peer-unavailable' ? 'ROOM ' + code + ' NOT FOUND' : 'CONNECTION ERROR: ' + (e.type || 'UNKNOWN').toUpperCase());
    });
  },

  leave() {
    try { if (this.conn) this.conn.close(); } catch { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch { /* ignore */ }
    this.conn = null;
    this.peer = null;
    this.resetRounds();
    rivalName = '';
  },
};

function showRivalReady() {
  const f2 = $('#f2');
  if (f2.classList.contains('shake')) return;
  setFighter(f2, '🔒', 'ready');
  if (!state.myPick) setBanner('RIVAL IS READY!', 'flash');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(5))].map((b) => chars[b % chars.length]).join('');
}

function setRoomParam(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function inviteLink() {
  const url = new URL(location.href);
  url.searchParams.set('room', $('#room-code').textContent);
  return url.toString();
}

function status(text) { $('#online-status').textContent = text; }

function resetLobby() {
  $('#invite-msg').hidden = true;
  $('#btn-host').hidden = false;
  $('#or-sep').hidden = false;
  $('#name-input').value = myName;
  $('#lobby-menu').hidden = false;
  $('#lobby-wait').hidden = true;
  status('');
  setRoomParam(null);
}

/* ---------- wiring ---------- */
function go(where) {
  sfx.nav();
  if (where === 'title') return quitToTitle();
  if (where === 'cpu') return startMatch('cpu');
  if (where === 'online') { resetLobby(); show('online'); }
}

document.addEventListener('click', (e) => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) return go(goBtn.dataset.go);
  const pickBtn = e.target.closest('[data-pick]');
  if (pickBtn) return pick(pickBtn.dataset.pick);
});

function renderSettings() {
  if (!VARIANTS[state.variant]) state.variant = 'classic';
  $('#btn-target').textContent = state.target;
  $('#btn-variant').textContent = VARIANTS[state.variant].label;
  $('#btn-level').textContent = LEVELS[state.level];
}

const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

$('#btn-target').addEventListener('click', () => {
  state.target = cycle(TARGETS, state.target);
  store.set('rps-target', state.target);
  renderSettings();
  sfx.select();
});
$('#btn-variant').addEventListener('click', () => {
  state.variant = cycle(Object.keys(VARIANTS), state.variant);
  store.set('rps-variant', state.variant);
  renderSettings();
  sfx.select();
});
$('#btn-level').addEventListener('click', () => {
  state.level = cycle(Object.keys(LEVELS), state.level);
  store.set('rps-level', state.level);
  renderSettings();
  sfx.select();
});

$('#name-input').value = myName;
$('#name-input').addEventListener('input', (e) => {
  const typed = cleanName(e.target.value);
  if (typed) { myName = typed; store.set('rps-name', myName); }
});
// An emptied field falls back to the last name instead of going nameless.
$('#name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('#invite-msg').hidden) net.join($('#room-input').value);
});
$('#name-input').addEventListener('blur', (e) => { e.target.value = myName; });
$('#btn-dice').addEventListener('click', () => {
  myName = randomName();
  store.set('rps-name', myName);
  $('#name-input').value = myName;
  sfx.select();
});

$('#btn-host').addEventListener('click', () => { sfx.select(); net.host(); });
$('#btn-join').addEventListener('click', () => { sfx.select(); net.join($('#room-input').value); });
$('#room-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') net.join(e.target.value); });
$('#btn-rematch').addEventListener('click', rematch);

$('#btn-copy').addEventListener('click', async () => {
  const link = inviteLink();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'RPS Arcade', text: 'Rock Paper Scissors — join my room!', url: link });
    } else {
      await navigator.clipboard.writeText(link);
      status('LINK COPIED!');
    }
  } catch {
    status(link);
  }
});

function setMuted(m) {
  muted = m;
  store.set('rps-muted', m);
  $('#btn-mute').textContent = m ? '🔇' : '🔊';
}
$('#btn-mute').addEventListener('click', () => setMuted(!muted));

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'm') return setMuted(!muted);
  if ($('#s-game').classList.contains('active')) {
    const moves = activeMoves();
    const move = /^[1-5]$/.test(key) ? moves[Number(key) - 1] : moves.find((m) => MOVES[m].key === key);
    if (move) return pick(move);
  }
  if (key === 'escape' && !$('#s-title').classList.contains('active')) return go('title');
});

/* ---------- boot ---------- */
renderSettings();
setMuted(muted);
updateHiscore();

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  // Invite link: let the guest pick a name first, then JOIN.
  const code = roomParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  show('online');
  $('#room-input').value = code;
  $('#invite-msg').textContent = "YOU'RE INVITED TO ROOM " + code + '! ENTER YOUR NAME AND PRESS JOIN';
  $('#invite-msg').hidden = false;
  $('#btn-host').hidden = true;
  $('#or-sep').hidden = true;
  $('#name-input').focus();
  $('#name-input').select();
}
