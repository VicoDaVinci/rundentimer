'use strict';

/* =========================================================
   Einstellungen
   ========================================================= */

const LIMITS = {
  round:  { min: 15, max: 1200, step: 15, time: true },  // Sekunden
  rest:   { min: 0,  max: 600,  step: 15, time: true },
  rounds: { min: 1,  max: 50,   step: 1,  time: false },
  prep:   { min: 0,  max: 60,   step: 5,  time: true },
};
const DEFAULTS = { round: 180, rest: 60, rounds: 5, prep: 10 };
const STORE_KEY = 'rundentimer.settings.v1';
const WARN_AT = 10;  // Sekunden vor Rundenende: Warnsignal + orange

let settings = loadSettings();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved) return { ...DEFAULTS, ...saved };
  } catch (e) { /* privater Modus o.ä. */ }
  return { ...DEFAULTS };
}
function saveSettings() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {}
}

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function formatValue(key) {
  const v = settings[key];
  if (key === 'rest' && v === 0) return 'keine';
  if (key === 'prep' && v === 0) return 'aus';
  return LIMITS[key].time ? fmt(v) : String(v);
}

/* =========================================================
   Einstellungs-Bildschirm
   ========================================================= */

const $ = (id) => document.getElementById(id);
const screens = { setup: $('setup'), run: $('run'), done: $('done') };

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

function renderSetup() {
  document.querySelectorAll('.row').forEach((row) => {
    row.querySelector('.value').textContent = formatValue(row.dataset.key);
  });
  const total = settings.prep + settings.rounds * settings.round + (settings.rounds - 1) * settings.rest;
  $('total').textContent = 'Gesamtdauer ' + fmt(total);

  renderPresets();
}

function changeSetting(key, dir) {
  const L = LIMITS[key];
  const next = Math.min(L.max, Math.max(L.min, settings[key] + dir * L.step));
  if (next === settings[key]) return false;
  settings[key] = next;
  saveSettings();
  renderSetup();
  return true;
}

// +/- Knöpfe: Antippen = ein Schritt, Gedrückthalten = schnell weiterzählen
document.querySelectorAll('.row .step').forEach((btn) => {
  const key = btn.closest('.row').dataset.key;
  const dir = Number(btn.dataset.dir);
  let delay, repeat;

  const stop = () => { clearTimeout(delay); clearInterval(repeat); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    changeSetting(key, dir);
    delay = setTimeout(() => {
      repeat = setInterval(() => { if (!changeSetting(key, dir)) stop(); }, 90);
    }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
});

/* =========================================================
   Vorlagen: "Boxen" fest + bis zu 3 eigene Timer.
   Die eigenen werden nur auf diesem Handy gespeichert.
   ========================================================= */

const BOXING = { name: 'Boxen', round: 180, rest: 60 };
const MAX_CUSTOM = 3;
const PRESET_KEY = 'rundentimer.presets.v1';

let customPresets = loadPresets();

function loadPresets() {
  try {
    const list = JSON.parse(localStorage.getItem(PRESET_KEY));
    if (Array.isArray(list)) return list.slice(0, MAX_CUSTOM);
  } catch (e) {}
  return [];
}
function savePresets() {
  try { localStorage.setItem(PRESET_KEY, JSON.stringify(customPresets)); } catch (e) {}
  // iOS bitten, die Daten dauerhaft zu behalten
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

function presetSub(p) {
  const rest = p.rest === 0 ? '—' : fmt(p.rest);
  return fmt(p.round) + ' / ' + rest + (p.rounds ? ' · ' + p.rounds + '×' : '');
}

function isActive(p) {
  return ['round', 'rest', 'rounds', 'prep'].every((k) => p[k] === undefined || p[k] === settings[k]);
}

function applyPreset(p) {
  for (const k of ['round', 'rest', 'rounds', 'prep']) if (p[k] !== undefined) settings[k] = p[k];
  saveSettings();
  renderSetup();
}

function presetButton(p, index) {
  const b = document.createElement('button');
  b.type = 'button';
  const name = document.createElement('span');
  name.textContent = p.name;
  const sub = document.createElement('small');
  sub.textContent = presetSub(p);
  b.append(name, sub);
  b.classList.toggle('active', isActive(p));

  let longPress = null, wasLong = false;
  b.addEventListener('click', () => { if (!wasLong) applyPreset(p); wasLong = false; });

  if (index >= 0) {
    // Gedrückt halten = bearbeiten
    b.addEventListener('pointerdown', () => {
      wasLong = false;
      longPress = setTimeout(() => { wasLong = true; openSheet(index); }, 550);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
      b.addEventListener(ev, () => clearTimeout(longPress)));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  return b;
}

function renderPresets() {
  const box = $('presets');
  box.replaceChildren(presetButton(BOXING, -1));
  customPresets.forEach((p, i) => box.append(presetButton(p, i)));
  if (customPresets.length < MAX_CUSTOM) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add';
    add.innerHTML = '<span>+ Eigener</span>';
    add.addEventListener('click', () => openSheet(-1));
    box.append(add);
  }
  $('presetHint').classList.toggle('hidden', customPresets.length === 0);
}

/* ---------- Fenster zum Speichern / Bearbeiten ---------- */

let editIndex = -1; // -1 = neuer Timer

function openSheet(index) {
  editIndex = index;
  const editing = index >= 0;
  $('sheetTitle').textContent = editing ? 'Timer bearbeiten' : 'Eigener Timer';
  $('sheetName').value = editing ? customPresets[index].name : '';
  $('sheetValues').textContent = editing
    ? 'Gespeichert: ' + valuesText(customPresets[index])
    : 'Speichert die aktuellen Werte: ' + valuesText(settings);
  // Beim Bearbeiten: aktuelle Werte nur auf Wunsch übernehmen
  const differs = editing && !isActive(customPresets[index]);
  $('sheetOverwrite').classList.toggle('hidden', !differs);
  if (differs) $('sheetOverwrite').textContent = 'Aktuelle Werte übernehmen: ' + valuesText(settings);
  $('sheetDelete').classList.toggle('hidden', !editing);
  $('sheet').classList.remove('hidden');
  // direkt im Fingertipp fokussieren, sonst öffnet iOS die Tastatur nicht
  if (!editing) $('sheetName').focus();
}

function closeSheet() {
  $('sheetName').blur();
  $('sheet').classList.add('hidden');
}

function valuesText(v) {
  return 'Runde ' + fmt(v.round) +
    ' · Pause ' + (v.rest === 0 ? 'keine' : fmt(v.rest)) +
    ' · ' + v.rounds + ' Runden' +
    ' · Vorlauf ' + (v.prep === 0 ? 'aus' : fmt(v.prep));
}

function sheetSave(takeCurrentValues) {
  const name = $('sheetName').value.trim() || 'Timer ' + (editIndex >= 0 ? editIndex + 1 : customPresets.length + 1);
  const current = { round: settings.round, rest: settings.rest, rounds: settings.rounds, prep: settings.prep };
  if (editIndex >= 0) {
    const old = customPresets[editIndex];
    customPresets[editIndex] = takeCurrentValues ? { name, ...current } : { ...old, name };
  } else if (customPresets.length < MAX_CUSTOM) {
    customPresets.push({ name, ...current });
  }
  savePresets();
  closeSheet();
  renderSetup();
}

$('sheetForm').addEventListener('submit', (e) => {
  e.preventDefault();
  sheetSave(editIndex < 0); // neu: aktuelle Werte; bearbeiten: nur Name
});
$('sheetOverwrite').addEventListener('click', () => sheetSave(true));

$('sheetDelete').addEventListener('click', () => {
  if (editIndex < 0) return;
  if (!confirm('„' + customPresets[editIndex].name + '“ löschen?')) return;
  customPresets.splice(editIndex, 1);
  savePresets();
  closeSheet();
  renderSetup();
});

$('sheetCancel').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });

/* =========================================================
   Töne (werden live erzeugt, keine Audiodateien nötig)

   Alle Töne einer Einheit werden beim Start im Voraus auf der
   Audio-Zeitachse eingeplant. Dadurch kommen sie auch dann,
   wenn das iPhone das Skript im Hintergrund anhält, solange
   das Audio selbst weiterläuft.
   ========================================================= */

let ctx = null;
let master = null;
let bus = null;        // Sammelkanal für eingeplante Töne (zum Abbrechen trennbar)
let noiseBuf = null;
let anchor = null;     // {ctxT, e}: Audio-Uhrzeit ↔ Trainingszeit

const keepAlive = new Audio('silence.wav');
keepAlive.loop = true;
keepAlive.preload = 'auto';
keepAlive.setAttribute('playsinline', '');

function initAudio() {
  // iOS: "playback" = Töne auch bei Lautlos-Schalter und möglichst auch im Hintergrund
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}

  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') ctx.resume();

  // iOS "entsperrt" Audio erst, wenn innerhalb eines Fingertipps etwas abgespielt wird
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

// Ringglocke wie beim Boxen: mehrere unharmonische Obertöne, die ausklingen
function bell(t, length = 2.2) {
  const base = 610;
  const partials = [[1, 1], [2.0, .55], [2.76, .5], [4.07, .28], [5.4, .18], [6.8, .1]];
  for (const [ratio, gain] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = base * ratio;
    const dur = length / Math.sqrt(ratio);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * .45, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + .05);
  }
  noise(t, .03, 3500, .35); // metallischer Anschlag
}

// Kurzer Piepton für 3-2-1
function beep(t, freq, dur = .14) {
  const o = ctx.createOscillator();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  f.type = 'lowpass';
  f.frequency.value = 3000;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(.22, t + .005);
  g.gain.setValueAtTime(.22, t + dur - .03);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f); f.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + .02);
}

// Rauschstoß (für Klapper und Glockenanschlag)
function noise(t, dur, freq, vol) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(.001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t, Math.random() * .5, dur + .01);
}

const sound = {
  roundStart: (t) => bell(t, 2.4),
  roundEnd:   (t) => { bell(t, 1.2); bell(t + .32, 1.2); bell(t + .64, 2.0); },
  warn:       (t) => { noise(t, .05, 1800, 1.6); noise(t + .16, .05, 1800, 1.6); }, // Holzklapper
  countRound: (t) => beep(t, 620),   // 3-2-1 vor Rundenende (tiefer)
  countRest:  (t) => beep(t, 1040),  // 3-2-1 vor Rundenstart (höher)
  finish:     (t) => { bell(t, 1.2); bell(t + .32, 1.2); bell(t + .64, 1.2); bell(t + .96, 2.6); },
};

// Liste aller Signale einer Einheit: [{at: Sekunde, type}]
function buildEvents() {
  const ev = [];
  phases.forEach((p, i) => {
    const end = p.start + p.dur;
    const next = phases[i + 1];
    if (p.kind === 'round') {
      ev.push({ at: p.start, type: 'roundStart' });
      if (p.dur >= 30) ev.push({ at: end - WARN_AT, type: 'warn' });
      if (p.dur > 3) for (let s = 3; s >= 1; s--) ev.push({ at: end - s, type: 'countRound' });
      if (!next) ev.push({ at: end, type: 'finish' });
      else if (next.kind !== 'round') ev.push({ at: end, type: 'roundEnd' });
    } else if (p.dur > 3) {
      for (let s = 3; s >= 1; s--) ev.push({ at: end - s, type: 'countRest' });
    }
  });
  return ev;
}

// Alte Planung verwerfen
function cancelSounds() {
  if (bus) { bus.disconnect(); bus = null; }
  anchor = null;
}

// Alle noch kommenden Signale ab dem aktuellen Zeitpunkt einplanen
function scheduleSounds() {
  cancelSounds();
  if (!ctx || pausedAt !== null) return;
  bus = ctx.createGain();
  bus.connect(master);
  const e = elapsedSec();
  const now = ctx.currentTime + .03;
  anchor = { ctxT: now, e };
  for (const ev of events) {
    if (ev.at >= e - .05) sound[ev.type](now + Math.max(0, ev.at - e));
  }
}

/* =========================================================
   Bildschirm wach halten
   ========================================================= */

let wakeLock = null;

async function lockScreen() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { /* nicht unterstützt oder abgelehnt */ }
}
function unlockScreen() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

/* =========================================================
   Sperrbildschirm / Kontrollzentrum
   ========================================================= */

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler('play', () => { if (pausedAt !== null) togglePause(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (pausedAt === null) togglePause(); });
  } catch (e) {}
}
function updateMediaSession(text) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: text, artist: 'Rundentimer' });
    navigator.mediaSession.playbackState = pausedAt === null ? 'playing' : 'paused';
  } catch (e) {}
}

/* =========================================================
   Timer-Logik
   Die Zeit wird immer aus der echten Uhrzeit berechnet, nicht
   hochgezählt. So bleibt der Timer genau, auch wenn das Handy
   die Seite kurz bremst.
   ========================================================= */

let phases = [];      // [{kind, n, dur, start}]
let events = [];      // eingeplante Signale
let startTs = 0;      // Zeitpunkt des Starts (ms)
let pausedAt = null;  // Zeitpunkt der Pause (ms) oder null
let pausedTotal = 0;  // Summe aller Pausen (ms)
let skipped = 0;      // durch "Weiter" übersprungene Zeit (ms)
let ticker = null;
let lastLabel = '';

function buildPhases() {
  phases = [];
  let t = 0;
  const add = (kind, n, dur) => { phases.push({ kind, n, dur, start: t }); t += dur; };
  if (settings.prep > 0) add('prep', 0, settings.prep);
  for (let i = 1; i <= settings.rounds; i++) {
    add('round', i, settings.round);
    if (i < settings.rounds && settings.rest > 0) add('rest', i, settings.rest);
  }
}

function elapsedSec() {
  const now = pausedAt ?? Date.now();
  return (now - startTs - pausedTotal + skipped) / 1000;
}

function phaseAt(e) {
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (e < p.start + p.dur) return i;
  }
  return -1; // fertig
}

function start() {
  initAudio();
  keepAlive.currentTime = 0;
  keepAlive.play().catch(() => {});
  setupMediaSession();

  buildPhases();
  events = buildEvents();
  startTs = Date.now();
  pausedAt = null;
  pausedTotal = 0;
  skipped = 0;
  lastLabel = '';
  showScreen('run');
  setPausedUI(false);
  lockScreen();
  scheduleSounds();
  ticker = setInterval(tick, 50);
  tick();
}

// keepSounds: beim regulären Ende die Schlussglocke ausklingen lassen
function stop(keepSounds = false) {
  clearInterval(ticker);
  ticker = null;
  if (!keepSounds) cancelSounds();
  keepAlive.pause();
  unlockScreen();
  document.body.className = '';
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'none'; } catch (e) {}
  }
}

function togglePause() {
  initAudio();
  if (pausedAt === null) {
    pausedAt = Date.now();
    cancelSounds();
    setPausedUI(true);
  } else {
    pausedTotal += Date.now() - pausedAt;
    pausedAt = null;
    keepAlive.play().catch(() => {});
    scheduleSounds();
    setPausedUI(false);
  }
  lastLabel = '';
  tick();
}

function skipPhase() {
  initAudio();
  const e = elapsedSec();
  const i = phaseAt(e);
  if (i < 0) return;
  const p = phases[i];
  skipped += (p.start + p.dur - e) * 1000 + 1;
  scheduleSounds();
  tick();
}

function setPausedUI(paused) {
  $('pauseBtn').textContent = paused ? 'Weiter' : 'Pause';
  $('pausedHint').classList.toggle('hidden', !paused);
  $('stopBtn').classList.toggle('hidden', !paused);
}

function finish() {
  stop(true);
  const n = settings.rounds;
  $('doneSub').textContent = n === 1 ? '1 Runde geschafft' : n + ' Runden geschafft';
  showScreen('done');
}

function label(p) {
  if (p.kind === 'prep') return 'Bereit machen';
  if (p.kind === 'rest') return 'Pause';
  return 'Runde ' + p.n + ' / ' + settings.rounds;
}

function tick() {
  const e = elapsedSec();
  const i = phaseAt(e);
  if (i < 0) { finish(); return; }

  // Läuft die Audio-Uhr nicht mehr synchron (z.B. weil iOS das Audio
  // im Hintergrund kurz angehalten hat), Töne neu einplanen.
  if (ctx && pausedAt === null) {
    if (ctx.state !== 'running') ctx.resume();
    if (ctx.state === 'running' && (!anchor || Math.abs(ctx.currentTime - (anchor.ctxT + (e - anchor.e))) > .25)) scheduleSounds();
  }

  const p = phases[i];
  const remaining = p.start + p.dur - e;
  const shown = Math.ceil(remaining - 1e-6);

  const warn = p.kind === 'round' && shown <= WARN_AT && p.dur >= 30;
  // Letzte 3 Sekunden: jede Sekunde erst weiß (zum Piepton), dann wieder Phasenfarbe
  const flash = pausedAt === null && p.dur > 3 && remaining <= 3 &&
    (remaining - Math.floor(remaining)) > .5;
  document.body.className = (warn ? 'warn' : p.kind) + (flash ? ' flash' : '');
  const text = label(p);
  $('phaseLabel').textContent = text;
  $('time').textContent = fmt(shown);
  $('bar').style.width = Math.min(100, (1 - remaining / p.dur) * 100) + '%';

  if (text !== lastLabel) { updateMediaSession(text); lastLabel = text; }
}

/* =========================================================
   Knöpfe
   ========================================================= */

$('startBtn').addEventListener('click', start);
$('pauseBtn').addEventListener('click', togglePause);
$('skipBtn').addEventListener('click', skipPhase);
$('stopBtn').addEventListener('click', () => { stop(); showScreen('setup'); });
$('backBtn').addEventListener('click', () => showScreen('setup'));

// Nach dem Zurückkehren in die App: Bildschirmsperre erneut anfordern
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ticker) {
    lockScreen();
    if (ctx && ctx.state !== 'running') ctx.resume();
    tick();
  }
});

renderSetup();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
