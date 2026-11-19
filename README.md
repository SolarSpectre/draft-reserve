# Draft Reserve

Draft Reserve helps League of Legends coaches rehearse a late-series Fearless Draft decision. Change a pick from the previous game, compare the lockouts, and check the opponent's recent draft evidence before copying a prep note.

## Run the demo

Use Node.js 24 and npm. From the project directory, run:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The included fictional best-of-five opens at Game 5. Change the Game 4 pick and inspect the opponent's late-series evidence. The **Watch briefing** button opens the original eight-second explainer.

## Import a GRID draft pack

The importer uses Python 3.14. During the hackathon, obtain the [official GRID starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter) in a sibling directory. The importer needs `lol/series.csv`, `meta/games.csv`, `meta/teams.csv`, `meta/characters.csv`, and the corresponding LoL event feeds. To download the LoL files and metadata:

```sh
git clone --filter=blob:none --sparse https://github.com/cloud9esports/stl-hackathon-2026-grid-starter.git ../stl-hackathon-2026-grid-starter
git -C ../stl-hackathon-2026-grid-starter sparse-checkout set lol meta
python scripts/import_grid.py --data-dir ../stl-hackathon-2026-grid-starter --output local-grid/lcs.json
```

In Draft Reserve, choose **Import draft file**, then select the JSON file. The browser reads the file in memory. Choose **Return to demo** to discard the imported session.

The default import selects the 2026 LCS splits. To test a small checkout, repeat `--series-id` for each downloaded series ID. Include earlier opponents' series if you want scouting evidence in addition to the replay.

Keep the starter checkout and all GRID-derived files out of Git and published builds. `local-grid/` is ignored. The [GRID data license](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter/blob/main/LICENSE.md) governs access and use. The [MIT license](LICENSE) covers this project's original code.

## Build and test

```sh
npm test
python -m unittest discover -s tests -p 'test_*.py'
npm run build
```

Vite writes the static site to `dist/`. For Vercel, import the repository, select the Vite preset, use Node.js 24, and publish on an unauthenticated production domain. The build uses the included fictional demo and original media.

See [methodology](docs/methodology.md) for scouting definitions and [design](docs/design.md) for the visual system and artwork source.
