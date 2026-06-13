// Boot: renderer, settings persistence, menu/game lifecycle, main loop.
import * as THREE from 'three';
import './style.css';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { Game } from './game.js';

const DEFAULT_SETTINGS = {
  sens: 1.0,
  fov: 90, // horizontal FOV, CS-style
  volume: 0.7,
  showFps: false,
  juice: true, // cinematic hitstop + slow-mo on the big moments
  performanceMode: false,
  crosshair: { color: '#7dffa0', size: 7, gap: 4, thickness: 2, dot: false },
  binds: null,
  lastSetup: null,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem('wizardstrike_settings');
    if (raw) {
      const s = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...s, crosshair: { ...DEFAULT_SETTINGS.crosshair, ...(s.crosshair || {}) } };
    }
  } catch { /* fresh */ }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

const settings = loadSettings();

// ----------------------------------------------------------------- renderer ---
const appEl = document.getElementById('app');
const uiEl = document.getElementById('ui');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
function applyRenderScale() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.performanceMode ? 1.0 : 1.35));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
applyRenderScale();
renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic response: glows bloom, darks stay rich
renderer.toneMappingExposure = 1.18;
appEl.appendChild(renderer.domElement);

let scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 600);
scene.add(camera);

function applyFov() {
  // settings.fov is horizontal: convert to vertical for the current aspect
  const h = (settings.fov * Math.PI) / 180;
  const v = 2 * Math.atan(Math.tan(h / 2) / camera.aspect);
  camera.fov = (v * 180) / Math.PI;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', () => {
  applyRenderScale();
  camera.aspect = window.innerWidth / window.innerHeight;
  applyFov();
});
camera.aspect = window.innerWidth / window.innerHeight;
applyFov();

// ------------------------------------------------------------------ systems ---
const audio = new AudioEngine();
audio.setVolume(settings.volume);
const input = new Input();
input.init(renderer.domElement);
if (settings.binds) input.load(settings.binds);
const hud = new HUD(uiEl, input, settings);

let game = null;
let paused = false;

function saveSettings() {
  settings.binds = input.serialize();
  try { localStorage.setItem('wizardstrike_settings', JSON.stringify(settings)); } catch { /* ok */ }
}

function applySettings() {
  audio.setVolume(settings.volume);
  applyRenderScale();
  applyFov();
  hud.applyCrosshair();
}

const menus = new Menus(uiEl, {
  settings, audio, input,
  saveSettings, applySettings,
  startGame, quitToMenu, resumeGame,
});

function startGame(setup, { requestLock = true } = {}) {
  disposeGame();
  audio.ensure();
  input.lockEnabled = requestLock;
  scene = new THREE.Scene();
  scene.add(camera);
  paused = false;
  game = window.__game = new Game({
    scene, camera, renderer, audio, input, hud, settings,
    onMatchEnd: (winner) => {
      setTimeout(() => {
        if (!game) return;
        input.unlock();
        hud.unbind();
        menus.showEnd(game, winner);
        menus.showLockOverlay(false);
        disposeGameKeepStats();
      }, 1400);
    },
  }, setup);
  menus.clear();
  if (requestLock) input.lock();
}

let endedGame = null;
function disposeGameKeepStats() {
  // keep the Game object alive for the end screen tables, but stop simulating
  endedGame = game;
  game = null;
  endedGame.dispose();
}

function disposeGame() {
  if (game) {
    game.dispose();
    game = null;
  }
  endedGame = null;
  hud.unbind();
}

function quitToMenu() {
  disposeGame();
  paused = false;
  input.lockEnabled = true;
  input.unlock();
  menus.showLockOverlay(false);
  menus.showMain();
}

function resumeGame() {
  if (!game) return;
  paused = false;
  game.paused = false;
  menus.clear();
  menus.showLockOverlay(false);
  audio.ensure();
  input.lock();
  // browsers refuse pointer lock for ~1.3s after an Esc exit; if the grab
  // failed, leave a click-to-relock overlay instead of an unresponsive game
  setTimeout(() => {
    if (game && !game.paused && !game.over && !input.locked && !hud.buyOpen) {
      menus.showLockOverlay(true);
    }
  }, 350);
}

function pauseGame() {
  if (!game || game.over) return;
  paused = true;
  game.paused = true;
  hud.openBuy(false);
  menus.showLockOverlay(false);
  menus.showPause();
}

// Esc in-game never reaches keydown: the browser exits pointer lock and
// swallows the key. Treat unexpected lock loss as "the player hit Esc" and
// open the pause menu. The keydown path below only fires while unlocked
// (paused / buy menu), where it acts as back/resume.
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (game && !game.over) {
      if (hud.buyOpen) { hud.openBuy(false); return; }
      if (!paused) pauseGame();
      else if (menus.activePanel === 'pause') resumeGame();
      else menus.showPause(); // back out of settings to the pause panel
    }
  }
});

let hadLock = false;
input.onLockChange = (locked) => {
  if (locked) hadLock = true;
  if (!game || game.over) { hadLock = locked; return; }
  if (!locked) {
    // only a genuine locked→unlocked transition means the player hit Esc;
    // failed lock *requests* can fire spurious change events
    const lost = hadLock;
    hadLock = false;
    if (lost && !paused && !hud.buyOpen) pauseGame();
  } else {
    menus.showLockOverlay(false);
  }
};

// first user gesture unlocks audio
window.addEventListener('pointerdown', () => audio.ensure(), { once: true });

// --------------------------------------------------------------------- loop ---
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (game && !paused) {
    game.update(dt);
  }
  input.endFrame(); // clear one-shot key edges exactly once per frame
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);

// ------------------------------------------------------------------- start ---
const params = new URLSearchParams(location.search);
if (params.get('auto')) {
  const setup = {
    mode: params.get('mode') === 'dm' ? 'dm' : 'relic',
    mapId: params.get('map') || 'dust2',
    team: params.get('team') === 'death' ? 'death' : 'order',
    charId: params.get('char') || 'harry',
    prefWand: 'holly',
    botsFriendly: 4, botsEnemy: 5,
    difficulty: params.get('diff') || 'normal',
    discipline: params.get('disc') || null,
    format: 'mr8',
    // hand-picked lineups (?squad=ginny,neville&foes=greyback,umbridge)
    squad: (params.get('squad') || '').split(',').filter(Boolean),
    foes: (params.get('foes') || '').split(',').filter(Boolean),
    dmBanned: (params.get('ban') || '').split(',').filter(Boolean),
  };
  // custom brain axes via URL (?diff=custom&rf=80&am=20&se=60&iq=40)
  if (setup.difficulty === 'custom') {
    setup.aiCustom = {
      reflex: Number(params.get('rf') ?? 50), aim: Number(params.get('am') ?? 50),
      sense: Number(params.get('se') ?? 50), iq: Number(params.get('iq') ?? 50),
    };
  }
  startGame(setup, { requestLock: false });
} else {
  menus.showMain();
}
