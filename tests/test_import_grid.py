import csv
import json
import subprocess
import sys
import tempfile
import unittest
from compression import zstd
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/import_grid.py"
START = "2026-04-06T13:00:01.009Z"
SID = "synthetic-series"
MISSING = "missing-series"
GAME = "draft-one"
TEAMS = ("north", "south")


def write_csv(path, headings, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(headings.split(","))
        writer.writerows(rows)


def draft_action(position, kind):
    return {
        "sequenceNumber": position + (0 if kind == "ban" else 10),
        "type": kind,
        "drafter": {"type": "team", "id": TEAMS[position % 2]},
        "draftable": {"type": "character", "id": f"{kind}-{position}", "name": f"Hero {kind} {position}"},
    }


class LocalGridImport(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "starter"
        self.output = self.root.parent / "private/drafts.json"
        self.index = self.root / "lol/series.csv"
        self.feed_path = f"lol/events_{SID}_grid.jsonl.zst"
        self.write_index(self.feed_path)
        write_csv(
            self.root / "meta/games.csv",
            "title,series_id,game_id,game_number,patch,started_at,finished,winner_team_id,team1_id,team2_id",
            [
                ["lol", SID, GAME, 1, "", START, True, "north", "north", "south"],
                ["lol", SID, "draft-three", 3, "26.7", START, True, "south", "north", "south"],
                ["val", SID, "ignored-val-row", 2, "ignored", START, True, "north", "north", "south"],
            ],
        )
        write_csv(
            self.root / "meta/teams.csv", "title,team_id,name",
            [["val", "north", "Wrong game"], ["lol", "north", "North"], ["lol", "south", "South"]],
        )
        write_csv(
            self.root / "meta/characters.csv", "title,character_id,name",
            [["lol", "pick-1", "Indexed hero"], ["val", "pick-2", "Wrong game"]],
        )

    def write_index(self, path):
        write_csv(
            self.index, "series_id,event,scheduled_start,teams,file",
            [
                [SID, "LCS - Split 2 2026", "2026-04-06T13:00:00Z", "North vs South", path],
                [MISSING, "LCS - Split 2 2026", START, "North vs South", f"lol/events_{MISSING}_grid.jsonl.zst"],
            ],
        )

    def write_feed(self, observations=()):
        draft = [draft_action(position, action) for action in ("ban", "pick") for position in range(1, 11)]
        result = {
            "id": SID, "format": "best-of-5", "startedAt": START, "valid": True,
            "teams": [{"id": team} for team in TEAMS],
            "games": [{
                "id": GAME, "sequenceNumber": 1, "titleVersion": {"name": "26.7"},
                "finished": True, "forfeited": False, "teams": [{"id": "north", "won": True}, {"id": "south", "won": False}],
                "draftActions": list(reversed(draft)),
            }],
        }
        events = [
            {
                "type": event_type, "actor": {"id": "south", "state": {"game": {"id": GAME}}},
                "target": {"id": champion}, "seriesStateDelta": {"games": [{"id": GAME}]},
            }
            for event_type, champion in observations
        ]
        events += [{"type": "series-ended-game", "seriesState": result}, {"type": "grid-ended-feed"}]
        self.write_events(enumerate(events))

    def write_events(self, events):
        with zstd.open(self.root / self.feed_path, "wt", encoding="utf-8") as stream:
            for sequence, event in events:
                stream.write(json.dumps({"seriesId": SID, "sequenceNumber": sequence, "events": [event]}) + "\n")

    def run_cli(self, *args, output=None):
        return subprocess.run(
            [sys.executable, "-B", str(SCRIPT), "--data-dir", str(self.root), "--output", str(output or self.output), *args],
            text=True, capture_output=True, timeout=20,
        )

    def test_normalizes_a_final_draft_and_merges_coverage_gaps(self):
        self.write_feed([("team-picked-character", "temporary"), ("team-!picked-character", "temporary"), ("team-picked-character", "pick-1")])
        run = self.run_cli()
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("Skipped 1 series", run.stderr)
        pack = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual((pack["version"], pack["source"]), (1, "grid"))
        self.assertEqual(pack["teams"], {"north": "North", "south": "South"})
        self.assertEqual(pack["champions"]["pick-1"], "Indexed hero")
        self.assertEqual(pack["champions"]["pick-2"], "Hero pick 2")
        series, = pack["series"]
        self.assertEqual((series["startedAt"], series["bestOf"], series["draftFormat"]), (START, 5, "full-fearless"))
        draft, gap = series["games"]
        self.assertEqual((draft["number"], draft["patch"], draft["winnerId"]), (1, "26.7", "north"))
        self.assertEqual(draft["coverage"], {"picks": True, "bans": True})
        self.assertEqual([item["championId"] for item in draft["actions"]], [f"{kind}-{i}" for kind in ("ban", "pick") for i in range(1, 11)])
        self.assertEqual(draft["actions"][0], {"kind": "ban", "teamId": "south", "championId": "ban-1"})
        self.assertEqual((gap["number"], gap["actions"], gap["coverage"]), (3, [], {"picks": False, "bans": False}))

    def test_observed_action_conflict_invalidates_only_its_coverage(self):
        self.write_feed([("team-picked-character", "different-id")])
        run = self.run_cli("--series-id", SID)
        self.assertEqual(run.returncode, 0, run.stderr)
        pack = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual(pack["series"][0]["games"][0]["coverage"], {"picks": False, "bans": True})

    def test_a_restarted_feed_replaces_the_superseded_session(self):
        def session(game_id, valid, drafts):
            return {"type": "series-ended-game", "seriesState": {
                "format": "best-of-5", "startedAt": START, "valid": valid,
                "teams": [{"id": team} for team in TEAMS],
                "games": [{"id": game_id, "sequenceNumber": 1, "finished": valid, "draftActions": drafts}],
            }}

        self.write_events([
            (1, {"type": "grid-started-feed"}),
            (2, session("superseded-game", True, [draft_action(2, "pick")])),
            (3, {"type": "grid-ended-feed"}),
            (1, {"type": "grid-started-feed"}),
            (2, session(GAME, False, [draft_action(1, "ban")])),
            (3, {"type": "grid-ended-feed"}),
        ])
        run = self.run_cli("--series-id", SID)
        self.assertEqual(run.returncode, 0, run.stderr)
        pack = json.loads(self.output.read_text(encoding="utf-8"))
        draft, gap = pack["series"][0]["games"]
        self.assertEqual(draft["id"], GAME)
        self.assertIsNone(draft["winnerId"])
        self.assertEqual(draft["coverage"], {"picks": False, "bans": False})
        self.assertEqual(draft["actions"], [{"kind": "ban", "teamId": "south", "championId": "ban-1"}])
        self.assertEqual(gap["number"], 3)
        self.assertEqual(set(pack["champions"]), {"ban-1"})

    def test_a_sequence_reset_without_a_feed_boundary_is_rejected(self):
        self.write_events([(5, {"type": "tournament-started-series"}), (1, {"type": "team-picked-character"})])
        run = self.run_cli("--series-id", SID)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("invalid event sequence", run.stderr)
        self.assertFalse(self.output.exists())

    def test_an_empty_terminal_snapshot_supersedes_earlier_drafts(self):
        final = {"format": "best-of-5", "startedAt": START, "teams": [{"id": team} for team in TEAMS]}
        early = {**final, "valid": True, "games": [{
            "id": GAME, "sequenceNumber": 1, "finished": True,
            "draftActions": [draft_action(1, "pick")],
        }]}
        self.write_events([
            (1, {"type": "series-ended-game", "seriesState": early}),
            (2, {"type": "tournament-invalidated-series", "seriesState": {**final, "valid": False, "games": []}}),
            (3, {"type": "grid-ended-feed"}),
        ])
        run = self.run_cli("--series-id", SID)
        self.assertEqual(run.returncode, 0, run.stderr)
        pack = json.loads(self.output.read_text(encoding="utf-8"))
        self.assertEqual(pack["champions"], {})
        for game in pack["series"][0]["games"]:
            self.assertEqual(game["actions"], [])
            self.assertEqual(game["coverage"], {"picks": False, "bans": False})
            self.assertIsNone(game["winnerId"])

    def test_explicit_missing_feed_does_not_overwrite_an_existing_export(self):
        self.output.parent.mkdir()
        self.output.write_text("previous import", encoding="utf-8")
        run = self.run_cli("--series-id", MISSING)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("is missing", run.stderr)
        self.assertEqual(self.output.read_text(encoding="utf-8"), "previous import")

    def test_source_paths_cannot_escape_the_starter(self):
        self.write_index("../unexpected.jsonl.zst")
        run = self.run_cli("--series-id", SID)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("leaves the GRID directory", run.stderr)
        self.assertFalse(self.output.exists())

    def test_output_is_rejected_inside_the_public_tree(self):
        run = self.run_cli(output=SCRIPT.parents[1] / "public/forbidden.json")
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("ignored local-grid directory", run.stderr)


if __name__ == "__main__":
    unittest.main()
