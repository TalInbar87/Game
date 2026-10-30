'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MOVES = {
  rock:     { emoji: '✊', beats: 'scissors' },
  paper:    { emoji: '✋', beats: 'rock' },
  scissors: { emoji: '✌️', beats: 'paper' },
};
const MOVE_KEYS = { '1': 'rock', '2': 'paper', '3': 'scissors', r: 'rock', p: 'paper', s: 'scissors' };
const TARGETS = [1, 3, 5, 7];
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
};

/* ---------- player names ---------- */
const cleanName = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9 _\-!?.א-ת]/g, '').trim().slice(0, 10);
let myName = cleanName(store.get('rps-name', ''));
let rivalName = '';

function rivalLabel() {
  return state.mode === 'cpu' ? 'CPU' : rivalName || 'RIVAL';
}

function renderNames() {
  const me = myName || 'YOU';
  $('#n1').textContent = 'P1 ' + me;
  $('#n2').textContent = rivalLabel() + ' P2';
  $('#t1').textContent = '▼ YOU';
  $('#t2').textContent = '▼ ' + rivalLabel();
}

/* ---------- game state ---------- */
const state = {
  mode: null,          // 'cpu' | 'online'
  target: store.get('rps-target', 3),
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
  $('#picks').hidden = false;
  $('#endgame').hidden = true;
  $$('#picks button').forEach((b) => { b.disabled = false; b.classList.remove('chosen'); });
  setBanner('CHOOSE!', 'flash');
  if (state.mode === 'online' && net.commits[state.round]) showRivalReady();
}

function pick(move) {
  if (state.busy || state.over || !MOVES[move]) return;
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

/* CPU: mostly random, with a small bias toward countering your favourite move. */
const moveLog = [];
function cpuMove() {
  const all = Object.keys(MOVES);
  if (moveLog.length >= 3 && Math.random() < 0.35) {
    const counts = {};
    moveLog.slice(-8).forEach((m) => { counts[m] = (counts[m] || 0) + 1; });
    const fav = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return all.find((m) => MOVES[m].beats === fav);
  }
  return all[Math.floor(Math.random() * all.length)];
}

async function resolveRound(mine, theirs) {
  if (state.mode === 'cpu') moveLog.push(mine);
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

  const outcome = mine === theirs ? 0 : MOVES[mine].beats === theirs ? 1 : -1;
  setFighter(f1, MOVES[mine].emoji, outcome === 1 ? 'win' : outcome === -1 ? 'lose' : '');
  setFighter(f2, MOVES[theirs].emoji, outcome === -1 ? 'win' : outcome === 1 ? 'lose' : '');
  setStamp(1, outcome === 1 ? 'WIN' : outcome === -1 ? 'LOSE' : 'DRAW');
  setStamp(2, outcome === -1 ? 'WIN' : outcome === 1 ? 'LOSE' : 'DRAW');

  if (outcome === 1) { state.score[0]++; setBanner('YOU WIN!', 'me'); sfx.point(); }
  else if (outcome === -1) { state.score[1]++; setBanner(rivalLabel() + ' WINS!', 'rival'); sfx.miss(); }
  else { setBanner('DRAW!'); sfx.draw(); }
  renderPips();

  const winner = state.score.findIndex((s) => s >= state.target);
  await sleep(2300); // keep the round result on screen
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
        if (!MOVES[d.move] || !this.commits[d.r] || this.reveals[d.r]) return;
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
      if (this.isHost) {
        this.resetRounds();
        this.send({ t: 'start', target: state.target, name: myName });
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

$('#btn-target').addEventListener('click', () => {
  state.target = TARGETS[(TARGETS.indexOf(state.target) + 1) % TARGETS.length];
  store.set('rps-target', state.target);
  $('#btn-target').textContent = state.target;
  sfx.select();
});

$('#name-input').value = myName;
$('#name-input').addEventListener('input', (e) => {
  myName = cleanName(e.target.value);
  store.set('rps-name', myName);
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
  if ($('#s-game').classList.contains('active') && MOVE_KEYS[key]) return pick(MOVE_KEYS[key]);
  if (key === 'escape' && !$('#s-title').classList.contains('active')) return go('title');
});

/* ---------- boot ---------- */
$('#btn-target').textContent = state.target;
setMuted(muted);
updateHiscore();

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam) {
  show('online');
  $('#room-input').value = roomParam.toUpperCase();
  net.join(roomParam);
}
