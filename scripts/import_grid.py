#!/usr/bin/env python3
"""Stream Cloud9's local GRID starter into a Draft Reserve import file."""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from compression import zstd
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile


LCS_EVENTS = {f"LCS - Split {split} 2026" for split in (1, 2, 3)}
DRAFT_EVENTS = {"picked": "pick", "banned": "ban"}


class GridImportError(ValueError):
    pass


@dataclass(frozen=True)
class DraftAction:
    kind: str
    team_id: str
    champion_id: str

    def as_json(self):
        return {"kind": self.kind, "teamId": self.team_id, "championId": self.champion_id}


@dataclass
class FeedSegment:
    snapshot: dict = field(default_factory=dict)
    observed: dict = field(default_factory=lambda: defaultdict(list))
    champion_names: dict = field(default_factory=dict)


def source_path(root, relative):
    relative = Path(relative)
    path = (root / relative).resolve()
    if relative.is_absolute() or not path.is_relative_to(root) or path == root:
        raise GridImportError(f"Source path leaves the GRID directory: {relative}")
    return path


def read_csv(root, relative, fields):
    path = source_path(root, relative)
    try:
        with path.open(encoding="utf-8-sig", newline="") as file:
            rows = csv.DictReader(file)
            missing = set(fields) - set(rows.fieldnames or [])
            if missing:
                raise GridImportError(f"{relative} is missing columns: {', '.join(sorted(missing))}")
            yield from rows
    except FileNotFoundError as error:
        raise GridImportError(f"Missing {relative} in the GRID directory.") from error


def identifier(value):
    return value if isinstance(value, str) and value.strip() else None


def ordinal(value):
    if type(value) is int or (isinstance(value, str) and value.isascii() and value.isdigit()):
        return int(value)
    return None


def iso_utc(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        time = datetime.fromisoformat(value)
    except ValueError:
        return None
    if time.tzinfo is None:
        return None
    return time.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def series_format(value):
    if isinstance(value, dict):
        return series_format(value.get("name")) or series_format(value.get("type")) or series_format(value.get("bestOf"))
    if isinstance(value, str):
        match = re.fullmatch(r"(?:best[\s_-]*of[\s_-]*|bo)([135])", value.lower().strip())
        if match:
            return int(match.group(1))
    return value if type(value) is int and value in (1, 3, 5) else None


def append_observation(feed, event):
    kind_match = re.fullmatch(r"team-(!?)(picked|banned)-character", event.get("type", ""))
    if not kind_match:
        return
    actor, target = event.get("actor") or {}, event.get("target") or {}
    team_id, champion_id = identifier(actor.get("id")), identifier(target.get("id"))
    if not team_id or not champion_id:
        return
    game_deltas = (event.get("seriesStateDelta") or {}).get("games", [])
    game_ids = [item["id"] for item in game_deltas if identifier(item.get("id"))]
    if len(game_ids) != 1:
        return
    action = DraftAction(DRAFT_EVENTS[kind_match[2]], team_id, champion_id)
    actions = feed.observed[game_ids[0]]
    if kind_match[1]:
        if action in actions:
            actions.remove(action)
    else:
        actions.append(action)


def read_feed(path, series_id):
    segment = FeedSegment()
    last_sequence = -1
    ended = False
    try:
        with zstd.open(path, "rt", encoding="utf-8") as file:
            for line_number, line in enumerate(file, 1):
                envelope = json.loads(line)
                sequence = ordinal(envelope.get("sequenceNumber"))
                if envelope.get("seriesId") != series_id:
                    raise GridImportError(f"Series {series_id}, line {line_number} belongs to a different series.")
                events = envelope["events"]
                started = len(events) == 1 and events[0].get("type") == "grid-started-feed"
                if ended and started:
                    segment = FeedSegment()
                    last_sequence = -1
                elif ended or (started and last_sequence >= 0):
                    raise GridImportError(f"Series {series_id}, line {line_number} has an unexpected feed boundary.")
                if sequence is None or sequence <= last_sequence:
                    raise GridImportError(f"Series {series_id}, line {line_number} has an invalid event sequence.")
                last_sequence = sequence
                ended = len(events) == 1 and events[0].get("type") == "grid-ended-feed"
                for event in events:
                    state = event.get("seriesState")
                    if state:
                        segment.snapshot = state
                    append_observation(segment, event)
    except FileNotFoundError as error:
        raise GridImportError(f"The feed for series {series_id} is missing. Include it in your GRID checkout.") from error
    except (json.JSONDecodeError, KeyError, TypeError, AttributeError, UnicodeDecodeError, zstd.ZstdError) as error:
        raise GridImportError(f"The feed for series {series_id} is malformed: {error}") from error
    if not segment.snapshot:
        raise GridImportError(f"The feed for series {series_id} has no series snapshot.")
    return segment


def normalize_actions(raw_actions, names, team_ids):
    sequenced = []
    incomplete = set()
    for row in raw_actions:
        kind = row.get("type")
        if kind not in {"pick", "ban"}:
            continue
        slot = ordinal(row.get("sequenceNumber"))
        drafter = row.get("drafter") or {}
        draftable = row.get("draftable") or {}
        team_id = identifier(drafter.get("id"))
        champion_id = identifier(draftable.get("id"))
        if slot is None or slot < 1 or team_id not in team_ids or not champion_id or draftable.get("type") != "character":
            incomplete.add(kind)
            continue
        if label := identifier(draftable.get("name")):
            names.setdefault(champion_id, label)
        sequenced.append((slot, DraftAction(kind, team_id, champion_id)))

    slot_counts = Counter(slot for slot, _ in sequenced)
    actions = []
    for slot, action in sorted(sequenced, key=lambda item: item[0]):
        if slot_counts[slot] == 1:
            actions.append(action)
        else:
            incomplete.add(action.kind)
    return actions, incomplete


def draft_coverage(actions, incomplete, observations, team_ids):
    coverage = {}
    for kind in ("pick", "ban"):
        matching = [action for action in actions if action.kind == kind]
        expected_teams = Counter({team_id: 5 for team_id in team_ids})
        observed = Counter(action for action in observations if action.kind == kind)
        coverage[f"{kind}s"] = (
            kind not in incomplete
            and Counter(action.team_id for action in matching) == expected_teams
            and len({action.champion_id for action in matching}) == 10
            and observed <= Counter(matching)
        )
    if {action.champion_id for action in actions if action.kind == "pick"} & {
        action.champion_id for action in actions if action.kind == "ban"
    }:
        coverage = {"picks": False, "bans": False}
    return coverage


def normalize_series(index, game_index, path):
    series_id = index["series_id"]
    indexed_games = {row["game_id"]: row for row in game_index}
    if len(indexed_games) != len(game_index):
        raise GridImportError(f"Series {series_id} has duplicate game IDs in meta/games.csv.")
    feed = read_feed(path, series_id)
    state = feed.snapshot
    team_ids = tuple(identifier(team.get("id")) for team in state.get("teams", []))
    if len(team_ids) != 2 and indexed_games:
        first = next(iter(indexed_games.values()))
        team_ids = (identifier(first["team1_id"]), identifier(first["team2_id"]))
    if len(team_ids) != 2 or not all(team_ids) or team_ids[0] == team_ids[1]:
        raise GridImportError(f"Series {series_id} does not identify two teams.")

    final_games = {game["id"]: game for game in state.get("games", []) if identifier(game.get("id"))}
    games = {}
    starts = []
    for game_id in indexed_games.keys() | final_games.keys():
        game = final_games.get(game_id, {})
        meta = indexed_games.get(game_id, {})
        snapshot_number = ordinal(game.get("sequenceNumber"))
        index_number = ordinal(meta.get("game_number"))
        if snapshot_number and index_number and snapshot_number != index_number:
            raise GridImportError(f"A game in series {series_id} has conflicting game numbers.")
        number = snapshot_number or index_number
        if number is None or not 1 <= number <= 5:
            raise GridImportError(f"A game in series {series_id} has an invalid game number.")
        if number in games:
            raise GridImportError(f"Series {series_id} has conflicting rows for game {number}.")
        if start := iso_utc(game.get("startedAt")) or iso_utc(meta.get("started_at")):
            starts.append(start)
        winners = [team.get("id") for team in game.get("teams", []) if team.get("won") is True]
        winner = winners[0] if len(winners) == 1 else identifier(meta.get("winner_team_id"))
        actions, incomplete = normalize_actions(game.get("draftActions", []), feed.champion_names, team_ids)
        valid = state.get("valid") is not False and not game.get("forfeited")
        if game.get("finished") is True and valid:
            coverage = draft_coverage(actions, incomplete, feed.observed.get(game_id, []), team_ids)
        else:
            coverage = {"picks": False, "bans": False}
        finished = game.get("finished") is True if game else (meta.get("finished") or "").lower() == "true"
        version = game.get("titleVersion") or {}
        games[number] = {
            "id": game_id,
            "number": number,
            "patch": identifier(meta.get("patch")) or identifier(version.get("name")),
            "winnerId": winner if valid and finished and winner in team_ids else None,
            "actions": [action.as_json() for action in actions],
            "coverage": coverage,
        }

    started_at = iso_utc(state.get("startedAt")) or min(starts, default=None) or iso_utc(index.get("scheduled_start"))
    if not started_at:
        raise GridImportError(f"Series {series_id} is missing a UTC start timestamp.")
    event = index["event"]
    return {
        "id": series_id,
        "event": event,
        "startedAt": started_at,
        "teamIds": list(team_ids),
        "bestOf": series_format(state.get("format")),
        "draftFormat": "full-fearless" if event in LCS_EVENTS else "unknown",
        "games": [games[number] for number in sorted(games)],
    }, feed.champion_names


def make_pack(root, selected_ids):
    index = read_csv(root, "lol/series.csv", {"series_id", "event", "scheduled_start", "file"})
    selected = {}
    for row in index:
        series_id = row["series_id"]
        matches = series_id in selected_ids if selected_ids else row["event"] in LCS_EVENTS
        if matches:
            if not identifier(series_id) or series_id in selected:
                raise GridImportError("The selection contains a missing or duplicate series ID.")
            if not identifier(row["event"]):
                raise GridImportError(f"Series {series_id} is missing its event name.")
            selected[series_id] = row
    if missing := selected_ids - selected.keys():
        raise GridImportError(f"Series IDs absent from lol/series.csv: {', '.join(sorted(missing))}")
    if not selected:
        raise GridImportError("No League of Legends series matched the selection.")

    game_rows = defaultdict(list)
    fields = {"title", "series_id", "game_id", "game_number", "patch", "started_at", "finished", "winner_team_id", "team1_id", "team2_id"}
    for row in read_csv(root, "meta/games.csv", fields):
        if row["title"] == "lol" and row["series_id"] in selected:
            game_rows[row["series_id"]].append(row)

    teams = names_by_id(root, "meta/teams.csv", "team_id")
    champions = names_by_id(root, "meta/characters.csv", "character_id")
    series = []
    used_teams = set()
    used_champions = set()
    skipped = 0
    for series_id, row in selected.items():
        path = source_path(root, row["file"])
        if not selected_ids and not path.is_file():
            skipped += 1
            continue
        item, additional_names = normalize_series(row, game_rows[series_id], path)
        series.append(item)
        used_teams.update(item["teamIds"])
        for name_id, name in additional_names.items():
            champions.setdefault(name_id, name)
        for game in item["games"]:
            used_champions.update(action["championId"] for action in game["actions"])

    if not series:
        raise GridImportError("No selected GRID feeds were found in the checkout.")
    if skipped:
        print(f"Skipped {skipped} series whose feeds are missing from the local checkout.", file=sys.stderr)
    return {
        "version": 1,
        "source": "grid",
        "teams": {key: teams.get(key, key) for key in sorted(used_teams)},
        "champions": {key: champions.get(key, key) for key in sorted(used_champions)},
        "series": sorted(series, key=lambda item: (item["startedAt"], item["id"])),
    }


def names_by_id(root, relative, field):
    return {
        row[field]: row["name"]
        for row in read_csv(root, relative, {"title", field, "name"})
        if row["title"] == "lol" and row[field] and row["name"]
    }


def write_pack(output, pack):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=output.parent, delete=False) as file:
            temporary = Path(file.name)
            json.dump(pack, file, ensure_ascii=False, separators=(",", ":"))
            file.write("\n")
        os.replace(temporary, output)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True, help="Path to the local GRID starter directory")
    parser.add_argument("--output", type=Path, required=True, help="Destination for the private JSON file")
    parser.add_argument("--series-id", action="append", default=[], help="Exact series ID. Repeat to import several.")
    args = parser.parse_args()
    root, output = args.data_dir.resolve(), args.output.resolve()
    project = Path(__file__).resolve().parents[1]
    try:
        if output.is_relative_to(root):
            raise GridImportError("Write the import file outside the GRID starter checkout.")
        if output.is_relative_to(project) and not output.is_relative_to(project / "local-grid"):
            raise GridImportError("Write the import file outside the project or under its ignored local-grid directory.")
        pack = make_pack(root, set(args.series_id))
        write_pack(output, pack)
    except (GridImportError, OSError) as error:
        parser.exit(1, f"draft-reserve: {error}\n")
    print(f"Imported {len(pack['series'])} series. Keep the output file local.")


if __name__ == "__main__":
    main()
