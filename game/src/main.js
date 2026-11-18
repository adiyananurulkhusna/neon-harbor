// Neon Harbor — boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast
// one), and the renderer paints what is there. The game moves between the
// title, play, paused, busted and wasted screens, and saves to localStorage.
//
// ?seed=N fixes the city and the traffic. ?shot=cover|drive|foot|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Fine for getting caught or going down: the hospital bill. */
const HOSPITAL_BILL = 200;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  renderer.snapCamera(world.state);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { hasSave: false }, false, 12.5);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let muted = false;
  let saveAvailable = hasSave();

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    world.saveGame();
    saveAvailable = true;
    screen = SCREEN_PLAY;
    announce('Bermain. Misi 1: temui Mara di Dermaga Neon.');
  }

  function continueGame() {
    if (world.loadGame()) {
      screen = SCREEN_PLAY;
      announce('Lanjutan dimuat. Selamat datang kembali di Neon Harbor.');
    } else {
      startNewGame();
    }
  }

  function respawnAfterTrouble() {
    const state = world.state;
    state.money = Math.max(0, state.money - HOSPITAL_BILL);
    state.player.health = 100;
    state.player.ammo = Math.max(state.player.ammo, 12);
    state.player.x = 1000;
    state.player.y = 1400;
    state.player.inCar = false;
    state.player.car = null;
    state.police.wanted = 0;
    state.police.stars = 0;
    state.copCars.length = 0;
    state.footCops.length = 0;
    state.over = null;
    world.saveGame();
    screen = SCREEN_PLAY;
  }

  function handleActions() {
    const actions = input.takeActions();
    let leftover = actions;
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        if (saveAvailable) continueGame();
        else startNewGame();
      }
      return 0;
    }
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        respawnAfterTrouble();
        announce('Keluar dari RS Harapan. Hati-hati di jalan.');
      }
      return 0;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Lanjut bermain.');
      }
      return 0;
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      world.saveGame();
      announce('Jeda. Permainan tersimpan.');
      return 0;
    }
    // ENTER_CAR and PUNCH are not screen actions: hand them to the world.
    leftover = actions & ~(ACTION_CONFIRM | ACTION_PAUSE | ACTION_MUTE);
    return leftover;
  }

  // Title-screen extras: N starts fresh, and S / Q work while paused.
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (screen === SCREEN_TITLE && event.code === 'KeyN') {
      audio.unlock();
      startNewGame();
    } else if (screen === SCREEN_PAUSED && event.code === 'KeyS') {
      world.saveGame();
      announce('Tersimpan.');
    } else if (screen === SCREEN_PAUSED && event.code === 'KeyQ') {
      screen = SCREEN_TITLE;
      saveAvailable = hasSave();
      announce('Neon Harbor. Tekan Spasi untuk bermain.');
    }
  });
  // Any gesture unlocks the synthesised sound.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  let accumulator = 0;
  let last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const pendingActions = handleActions();
    if (screen === SCREEN_PLAY) {
      const mouse = input.mouse();
      const mouseWorld = renderer.screenToWorld(mouse.x, mouse.y);
      let firstStep = true;
      while (accumulator >= STEP) {
        const controls = {
          move: input.move(),
          run: input.running(),
          actions: firstStep ? pendingActions : 0,
          click: input.takeClick(),
          mouseDown: mouse.down,
          mouseWorld,
        };
        firstStep = false;
        const events = world.step(STEP, controls);
        accumulator -= STEP;
        if (events & EVENT_BUSTED) {
          screen = SCREEN_BUSTED;
          announce('Tertangkap! Polisi membawamu ke kantor polisi.');
          break;
        }
        if (events & EVENT_WASTED) {
          screen = SCREEN_WASTED;
          announce('Raka tumbang dan dibawa ke RS Harapan.');
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, { hasSave: saveAvailable }, muted, now / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      world.saveGame();
      announce('Jeda.');
    }
  });

  announce('Neon Harbor. Tekan Spasi atau klik untuk bermain.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
