# Chromafall

A neon cascade puzzle — tap color clusters, watch them fall.

Built with [Phaser 3](https://phaser.io/) + TypeScript + Vite, packaged as an installable PWA. Future targets: iOS and Android via Capacitor.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Scripts

- `npm run dev` — Vite dev server with HMR
- `npm run build` — type-check + production build to `dist/`
- `npm run preview` — preview the production build
- `npm run type-check` — TypeScript check only

## Project layout

```
src/
  main.ts              Phaser bootstrap
  game/                Pure game logic (port from TetriBricks C# core)
    types.ts           BrickColor enum
    brick.ts           Brick
    column.ts          BrickColumn
    engine.ts          Game + GameController (flood fill, gravity, undo/redo)
  scenes/              Phaser scenes
    BootScene.ts
    MenuScene.ts
    GameScene.ts
    GameOverScene.ts
  theme/palette.ts     Neon Cascade colors
  storage/highScores.ts  localStorage high scores
public/
  icons/               PWA icons
```

## Roadmap

- v0.1 — playable core loop, localStorage high scores (current)
- v0.2 — particle FX, screen shake, SFX, combo text (juice)
- v0.3 — responsive layout polish, touch refinement
- v0.4 — PWA icons (PNG), install testing on iOS/Android
- v1.0 — Capacitor wrap, App Store + Play Store submission

## License

MIT
