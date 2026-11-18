# neon-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/adiyananurulkhusna/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/adiyananurulkhusna/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Neon Harbor** is an open-world top-down 2D city game, built in vanilla JavaScript on
canvas — no libraries, no network requests, no external assets. You are Raka, a
newcomer to the sunny seaside city of Neon Harbor, who gets drawn into the world of
Mara and her crew across six story missions.

- **A city to explore:** a 2600×2600 grid of streets, buildings, parks, a harbor
  pier, and a beach, with traffic that follows the roads and pedestrians who
  stroll the sidewalks (and panic when things get loud).
- **Drive and steal cars:** walk up to any car, press E to get in, and drive —
  taxis, sedans, hatchbacks, vans, and a gold sports car. Traffic AI follows
  lanes; police cars chase you when you are wanted.
- **Wanted 0–5 stars:** crimes raise your wanted level; police chase you on
  foot and in cars, and can bust you. Lay low and hide to cool off.
- **Combat:** punch (F) and shoot (click) with limited ammo; pick up ammo,
  health, and cash around the city; enemy gang members fight back in missions.
- **Six story missions:** meet Mara at the pier, deliver packages for Riko,
  chase a rogue courier, clear the harbor warehouse, escape a police raid, and
  the final Neon Run. Each pays out cash you keep.
- **HUD, minimap, and save:** health, cash, wanted stars, a live minimap, a
  clock, and mission objectives — plus pause (P) and automatic saving to
  localStorage.
- **Sound:** all effects and the bass music loop are synthesized with WebAudio.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk or drive |
| E | Enter / exit a car |
| Click | Shoot (aim with the mouse) |
| F | Punch |
| P | Pause (saves the game) |
| S | Save |
| Q | Back to title |
| M | Mute |
| Shift | Run |

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

`?seed=<n>` starts a new city from a given seed; `?shot=cover|drive|foot|mission&seed=1`
renders the staged screenshot scenes used for the entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0sc1f0wn&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
