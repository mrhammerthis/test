# Three-JS Diablo-Inspired Clone (Prototype)

This project is a highly detailed, browser-based action-RPG prototype inspired by Diablo's top-down combat loop and atmospheric dungeon style.

## What's implemented

- Isometric/top-down camera follow system.
- Dark gothic arena with fog, pillars, runic ritual ring, and layered dynamic lights.
- Fully controllable hero with:
  - WASD movement,
  - cursor-based aiming,
  - mana and life systems,
  - level progression.
- Three active skills:
  - **Fire Bolt** (LMB): rapid single-target projectile,
  - **Spirit Lance** (RMB): piercing burst attack,
  - **Whirl** (Space): close-range expanding AoE.
- Enemy wave scaling with multiple enemy archetypes:
  - Imp (fast),
  - Ghoul (balanced),
  - Brute (heavy).
- Combat systems:
  - enemy pursuit and melee attacks,
  - projectile collisions,
  - AoE damage-over-time ring,
  - combat log.
- ARPG progression loop:
  - experience gain,
  - level-up scaling,
  - gold drops,
  - randomized magic/rare/legendary item drops.
- Full HUD:
  - life/mana/xp bars,
  - skill cooldown state,
  - kill count + gold,
  - objective tracker,
  - recent loot list with generated item icons.
- Loot image generation modes:
  - **Free local generator** (default): procedural icon art in-browser for every dropped item,
  - **ChatGPT image mode** (optional): uses OpenAI image generation API (`gpt-image-1`) when enabled with an API key.

## Run locally

Use the launcher (recommended):

```bash
./scripts/launch_game.sh
```

The launcher validates prerequisites and starts the local server on port `4173` by default.

Useful options:

```bash
PORT=5000 ./scripts/launch_game.sh
AUTO_OPEN=1 ./scripts/launch_game.sh
HOST=127.0.0.1 ./scripts/launch_game.sh
PYTHON_BIN=python3 ./scripts/launch_game.sh
```

Manual fallback:

```bash
python3 -m http.server 4173
```

Then open:

- `http://localhost:4173`

## Controls

- `WASD` — move
- `Mouse` — aim
- `LMB` — Fire Bolt
- `RMB` — Spirit Lance
- `Space` — Whirl

## Notes

This is a no-build static prototype intended to maximize fidelity to Diablo-like pacing and feel while staying in plain HTML/CSS/JS + Three.js.

### Item image generation setup

- Open the **Recent Loot** panel.
- (Optional) enable **ChatGPT image mode**.
- Paste your OpenAI API key.
- New item drops will then request image generations from OpenAI; if any request fails, the game automatically falls back to the free local icon generator.
