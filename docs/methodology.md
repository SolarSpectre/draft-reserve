# Draft Reserve methodology

## Game checkpoint

Draft Reserve compares entry into Games 3, 4, and 5 in a documented best-of-five under Full Fearless rules. Picks from either team in completed prior games become unavailable to both teams. Standard bans apply to their own game. The workbench separates a missing prior draft from a series that ended before the selected game.

In a what-if scenario, change one of your team's picks in the immediately preceding game. The comparison holds the other recorded picks and bans fixed. It shows the champions entering and leaving the shared Fearless-unlocked set before standard bans. It does not forecast draft order, opponent reactions, or match outcomes.

## Opponent evidence

Use up to 20 verified drafts from strictly earlier series. A draft contributes only when the earlier numbered games provide a complete verified pick history. For each champion, exclude games where an earlier Fearless pick locked that champion out. Show picks or standard bans over the eligible drafts that record that action type. Report the sample window and expose the source games. The late-series view covers Games 3–5. Counts from fewer than five eligible drafts are sparse.

GRID is the source for real pick, ban, and match data. The workspace calls the computed state **Fearless-unlocked**. Use **Tournament restrictions** to exclude champions disabled for the selected series.

## Data delivery

The public demo uses fictional match results and official Riot Data Dragon champion portraits. Judges can reproduce the real replay by importing a draft pack made from their authorized local GRID checkout. The app reads the pack in browser memory. The pack is a local derived file covered by the starter license. Portraits are fetched from Riot's CDN by champion filename.

[Riot's Full Fearless explanation](https://lolesports.com/en-US/news/lol-esports-in-2025) · [GRID starter](https://github.com/cloud9esports/stl-hackathon-2026-grid-starter)
