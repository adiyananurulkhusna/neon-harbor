// Missions and story: six jobs for Raka, a courier who owes the wrong people
// money, told through briefings, short dialog lines and a moving objective
// marker. Every name here is invented for Neon Harbor. The mission state is
// plain data; the world owns the actors and the mission module only reads the
// state and asks the world (through `api`) to spawn things and pay out.

import { LANDMARKS } from './city.js';
import { distance } from './random.js';

export const MISSIONS = [
  {
    id: 'meet-mara',
    title: 'Kenalan di Dermaga',
    briefing: 'Temui Mara di Dermaga Neon. Dia punya pekerjaan untukmu.',
    objective: 'Pergi ke Dermaga Neon dan temui Mara',
    reward: 150,
    dialog: [
      'Mara: "Raka, akhirnya. Kamu terlambat."',
      'Raka: "Macet, Mara. Ada apa?"',
      'Mara: "Aku butuh kurir yang tidak bertanya. Kamu butuh uang. Cocok."',
    ],
  },
  {
    id: 'packages',
    title: 'Paket untuk Riko',
    briefing: 'Ambil 3 paket titipan Riko yang tersebar di kota dan bawa semuanya.',
    objective: 'Ambil 3 paket (0/3)',
    reward: 300,
    dialog: [
      'Riko: "Paketnya ada tiga. Jangan dibuka, jangan telat."',
      'Raka: "Selalu begitu, Riko."',
    ],
  },
  {
    id: 'chase',
    title: 'Kejar Kurir Liar',
    briefing: 'Seorang kurir liar membawa paketmu kabur. Kejar mobilnya dan pepet sampai dia menyerah.',
    objective: 'Pepet mobil kurir sampai dia menyerah',
    reward: 450,
    dialog: [
      'Mara: "Kurir itu kabur dengan paket kita. Kejar dia!"',
      'Raka: "Dia tidak akan jauh."',
    ],
  },
  {
    id: 'warehouse',
    title: 'Gudang Pelabuhan',
    briefing: 'Geng Pelabuhan menjaga gudang tempat paket disimpan. Singkirkan mereka semua.',
    objective: 'Singkirkan geng di Gudang Pelabuhan (0/4)',
    reward: 700,
    dialog: [
      'Raka: "Gudang itu dijaga empat orang. Aku harus berani."',
      'Mara: "Hati-hati. Mereka tidak main-main."',
    ],
  },
  {
    id: 'escape',
    title: 'Lolos dari Razia',
    briefing: 'Polisi menggelar razia di seluruh kota. Sampai ke Rumah Aman dan bersembunyi sampai keadaan tenang.',
    objective: 'Sampai ke Rumah Aman dan bersembunyi',
    reward: 900,
    dialog: [
      'Mara: "Razia di mana-mana! Jangan sampai ketangkap."',
      'Raka: "Rumah Aman. Aku tahu jalannya."',
    ],
  },
  {
    id: 'neon-run',
    title: 'Neon Run Terakhir',
    briefing: 'Curi mobil sport emas di Showroom Kilau dan antar ke Gudang Selatan. Ini pekerjaan terakhir.',
    objective: 'Curi mobil sport emas, antar ke Gudang Selatan',
    reward: 1500,
    dialog: [
      'Mara: "Mobil emas itu kunci semuanya. Ambil, antar, selesai."',
      'Raka: "Setelah ini aku bebas. Aku janji."',
    ],
  },
];

export function createMissionState() {
  return {
    index: 0,
    done: false,
    stage: 0,
    progress: 0,
    chaseTime: 0,
    hideTime: 0,
    courierId: null,
    goldCarId: null,
    packageSpots: [],
    dialogText: '',
    dialogTimer: 0,
    started: false,
  };
}

export function currentMission(state) {
  return state.done ? null : MISSIONS[state.index];
}

/** Short objective line for the HUD, with live counts. */
export function missionObjectiveText(state) {
  const m = currentMission(state);
  if (!m) return 'Semua misi selesai — kota ini milikmu, Raka.';
  if (m.id === 'packages') return `Ambil 3 paket (${state.progress}/3)`;
  if (m.id === 'warehouse') return `Singkirkan geng di Gudang Pelabuhan (${state.progress}/4)`;
  return m.objective;
}

/** Where the yellow marker on the map and in the world should point. */
export function missionTarget(state) {
  const m = currentMission(state);
  if (!m) return null;
  if (m.id === 'meet-mara') return { x: LANDMARKS.pier.x, y: LANDMARKS.pier.y, label: 'Mara' };
  if (m.id === 'packages') {
    const next = state.packageSpots.find((p) => !p.taken);
    return next ? { x: next.x, y: next.y, label: 'Paket' } : null;
  }
  if (m.id === 'chase') return { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, label: 'Kurir liar' };
  if (m.id === 'warehouse') return { x: LANDMARKS.warehouse.x, y: LANDMARKS.warehouse.y, label: 'Gudang' };
  if (m.id === 'escape') return { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, label: 'Rumah Aman' };
  if (m.id === 'neon-run') {
    if (state.stage === 0) return { x: LANDMARKS.goldCar.x, y: LANDMARKS.goldCar.y, label: 'Mobil emas' };
    return { x: LANDMARKS.dropoff.x, y: LANDMARKS.dropoff.y, label: 'Gudang Selatan' };
  }
  return null;
}

/** Begin (or re-begin) the current mission: spawn what it needs and say the lines. */
export function startMission(state, api) {
  const m = currentMission(state);
  if (!m) return;
  state.started = true;
  state.progress = 0;
  state.chaseTime = 0;
  state.hideTime = 0;
  state.stage = 0;
  api.notify(`Misi ${state.index + 1}/6: ${m.title}`);
  api.say(m.dialog[0] || '');
  if (m.id === 'packages') {
    state.packageSpots = [
      { x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y, taken: false },
      { x: LANDMARKS.park.x, y: LANDMARKS.park.y, taken: false },
      { x: 1800, y: 1000, taken: false },
    ];
    api.spawnPackages(state.packageSpots);
  } else if (m.id === 'chase') {
    state.courierId = api.spawnCourier({ x: LANDMARKS.plaza.x, y: LANDMARKS.plaza.y + 120 });
  } else if (m.id === 'warehouse') {
    api.spawnEnemies([
      { x: LANDMARKS.warehouse.x - 60, y: LANDMARKS.warehouse.y - 40 },
      { x: LANDMARKS.warehouse.x + 70, y: LANDMARKS.warehouse.y - 30 },
      { x: LANDMARKS.warehouse.x - 40, y: LANDMARKS.warehouse.y + 70 },
      { x: LANDMARKS.warehouse.x + 60, y: LANDMARKS.warehouse.y + 80 },
    ]);
  } else if (m.id === 'escape') {
    api.setWanted(3);
  } else if (m.id === 'neon-run') {
    state.goldCarId = api.spawnGoldCar({ x: LANDMARKS.goldCar.x, y: LANDMARKS.goldCar.y });
  }
}

/** Finish the current mission: pay out and move to the next one. */
export function completeMission(state, api) {
  const m = currentMission(state);
  if (!m) return;
  api.addMoney(m.reward);
  api.notify(`Misi selesai! +$${m.reward}`);
  api.jingle();
  state.index += 1;
  state.started = false;
  if (state.index >= MISSIONS.length) {
    state.done = true;
    api.say('Mara: "Selesai, Raka. Kota ini milikmu sekarang."');
    api.notify('Semua misi selesai! Kamu legenda Neon Harbor.');
    return;
  }
  startMission(state, api);
}

/** Check the current mission's win condition once per step. */
export function updateMissions(state, dt, api, playerPos, enemiesLeft) {
  const m = currentMission(state);
  if (!m || !state.started) return;
  if (state.dialogTimer > 0) state.dialogTimer -= dt;

  if (m.id === 'meet-mara') {
    if (distance(playerPos.x, playerPos.y, LANDMARKS.pier.x, LANDMARKS.pier.y) < 70) completeMission(state, api);
  } else if (m.id === 'packages') {
    const got = state.packageSpots.filter((p) => p.taken).length;
    state.progress = got;
    if (got >= 3) completeMission(state, api);
  } else if (m.id === 'chase') {
    const courier = api.courierCar(state.courierId);
    if (courier) {
      const d = distance(playerPos.x, playerPos.y, courier.x, courier.y);
      if (d < 80) state.chaseTime += dt;
      else state.chaseTime = Math.max(0, state.chaseTime - dt * 0.5);
      if (state.chaseTime >= 3) completeMission(state, api);
    }
  } else if (m.id === 'warehouse') {
    state.progress = 4 - enemiesLeft;
    if (enemiesLeft <= 0) completeMission(state, api);
  } else if (m.id === 'escape') {
    const d = distance(playerPos.x, playerPos.y, LANDMARKS.safehouse.x, LANDMARKS.safehouse.y);
    if (d < 80) {
      if (api.nearestCopDistance() > 350) {
        state.hideTime += dt;
        if (state.hideTime >= 8) {
          api.setWanted(0);
          completeMission(state, api);
        }
      } else {
        state.hideTime = Math.max(0, state.hideTime - dt);
      }
    } else {
      state.hideTime = 0;
    }
  } else if (m.id === 'neon-run') {
    if (state.stage === 0 && api.inGoldCar(state.goldCarId)) {
      state.stage = 1;
      api.say('Raka: "Dapat! Sekarang ke Gudang Selatan."');
      api.notify('Mobil emas dicuri — antar ke Gudang Selatan!');
    } else if (state.stage === 1) {
      const d = distance(playerPos.x, playerPos.y, LANDMARKS.dropoff.x, LANDMARKS.dropoff.y);
      if (d < 90) completeMission(state, api);
    }
  }
}
