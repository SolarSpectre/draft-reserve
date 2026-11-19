# Draft Reserve

Draft Reserve is a League of Legends coaching tool for rehearsing late-series Full Fearless drafts. Replay a recorded draft, change one pick, and see which champions enter or leave both teams' pools. Open the opponent's source drafts before copying a prep note.

## Run the demo

Use Node.js 24 and npm. From the project directory, run:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The fictional Northstar–Emberline series opens at 2–2 with Azir exchanged for Orianna in Game 4. Use **Replacement** to try a different pick, **Replay swap** to replay the lockout change, and an opponent scouting row to inspect the matches behind its pick and ban counts. **Watch briefing** opens an eight-second explainer. Champion portraits are official Riot Data Dragon assets.

## Import a GRID draft pack

The importer uses Python 3.14. During the hackathon, obtain the [official GRID starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter) in a sibling directory. The importer needs `lol/series.csv`, `meta/games.csv`, `meta/teams.csv`, `meta/characters.csv`, and the corresponding LoL event feeds. To download the LoL files and metadata:

```sh
git clone --filter=blob:none --sparse https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../stl-hackathon-2026-grid-starter
git -C ../stl-hackathon-2026-grid-starter sparse-checkout set lol meta
python scripts/import_grid.py --data-dir ../stl-hackathon-2026-grid-starter --output local-grid/lcs.json
```

In Draft Reserve, choose **Import draft file**, then select `local-grid/lcs.json`. The app prioritizes a covered Cloud9 best-of-five that reaches Game 5. Open **Game 4** on the timeline to see its actual pick/ban order. Choose a replacement and a backup, then open a scouting row to check the evidence. **Our team** switches the scouting opponent. The browser reads the file in memory. Choose **Return to demo** to discard the imported session.

The default import selects the 2026 LCS splits. To test a small checkout, repeat `--series-id` for each downloaded series ID. Include earlier opponents' series if you want scouting evidence in addition to the replay.

Keep the starter checkout and GRID-derived files out of Git and published builds. `local-grid/` is ignored. The [GRID data license](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter/blob/main/LICENSE.md) governs access and use. The [MIT license](LICENSE) covers this project's original code. [Riot's static assets](https://developer.riotgames.com/docs/lol#data-dragon) are separately licensed and credited in the app.

## Build and test

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

Vite writes the static site to `dist/`. For Vercel, import the repository, select the Vite preset, and use Node.js 24. The public build opens the fictional series and supports local GRID imports.

## JetBrains tooling

The frontend was inspected in WebStorm 2026.3 with the shared [Draft Reserve inspection profile](.idea/inspectionProfiles/Draft_Reserve.xml). The profile checks TypeScript references and unused JavaScript or TypeScript symbols. To reproduce it, open the project in WebStorm, select **Draft Reserve** in the inspection settings, and run **Inspect Code** on `src`.

See [methodology](docs/methodology.md) for scouting definitions and [design](docs/design.md) for the visual system and artwork source.
