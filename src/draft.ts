export type DraftAction = { kind: 'pick' | 'ban'; teamId: string; championId: string };
export type DraftGame = {
  id: string;
  number: number;
  patch: string | null;
  winnerId: string | null;
  actions: DraftAction[];
  coverage: { picks: boolean; bans: boolean };
};
export type DraftSeries = {
  id: string;
  event: string;
  startedAt: string;
  teamIds: [string, string];
  bestOf: 1 | 3 | 5 | null;
  draftFormat: 'full-fearless' | 'unknown';
  games: DraftGame[];
};
export type DraftPack = {
  version: 1;
  source: 'grid' | 'demo';
  teams: Record<string, string>;
  champions: Record<string, string>;
  series: DraftSeries[];
};
export type Checkpoint = 3 | 4 | 5;
export type Cohort = 'Late series' | 'All games' | Checkpoint;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function names(value: unknown, label: string): Record<string, string> {
  if (!isRecord(value)) throw new Error(`The ${label} directory is missing.`);
  const entries = Object.entries(value).map(([id, name]): [string, string] => {
    if (!isText(id) || !isText(name)) throw new Error(`An entry in the ${label} directory has an invalid ID or name.`);
    return [id, name];
  });
  return Object.assign(Object.create(null) as Record<string, string>, Object.fromEntries(entries));
}

function readGame(value: unknown, teamIds: [string, string], champions: Record<string, string>): DraftGame {
  if (!isRecord(value) || !isText(value.id) || typeof value.number !== 'number' ||
      !Number.isInteger(value.number) || value.number < 1 || value.number > 5 ||
      !(value.patch === null || isText(value.patch)) || !(value.winnerId === null || (isText(value.winnerId) && teamIds.includes(value.winnerId))) ||
      !isRecord(value.coverage) || typeof value.coverage.picks !== 'boolean' || typeof value.coverage.bans !== 'boolean' || !Array.isArray(value.actions)) {
    throw new Error('A game has invalid draft metadata.');
  }
  const actions = value.actions.map((action: unknown): DraftAction => {
    if (!isRecord(action) || (action.kind !== 'pick' && action.kind !== 'ban') ||
        !isText(action.teamId) || !teamIds.includes(action.teamId) || !isText(action.championId) || !Object.hasOwn(champions, action.championId)) {
      throw new Error(`Game ${value.number} has an invalid draft action or an unknown champion.`);
    }
    return { kind: action.kind, teamId: action.teamId, championId: action.championId };
  });
  const picks = actions.filter(action => action.kind === 'pick');
  const bans = actions.filter(action => action.kind === 'ban');
  const unique = (rows: DraftAction[]) => new Set(rows.map(action => action.championId)).size === rows.length;
  if (value.coverage.picks && (!unique(picks) || teamIds.some(team => picks.filter(action => action.teamId === team).length !== 5))) {
    throw new Error(`Game ${value.number} marks its picks complete but does not contain five distinct picks per team.`);
  }
  if (value.coverage.bans && (!unique(bans) || teamIds.some(team => bans.filter(action => action.teamId === team).length > 5))) {
    throw new Error(`Game ${value.number} marks its bans complete but contains duplicate or excess bans.`);
  }
  if (value.coverage.picks && value.coverage.bans && !unique(actions)) {
    throw new Error(`Game ${value.number} lists a champion as both picked and banned.`);
  }
  return { id: value.id, number: value.number, patch: value.patch, winnerId: value.winnerId, actions, coverage: { picks: value.coverage.picks, bans: value.coverage.bans } };
}

export function parsePack(value: unknown): DraftPack {
  if (!isRecord(value) || value.version !== 1 || (value.source !== 'grid' && value.source !== 'demo') || !Array.isArray(value.series)) {
    throw new Error('Choose a version 1 Draft Reserve JSON export.');
  }
  const teams = names(value.teams, 'team');
  const champions = names(value.champions, 'champion');
  const seen = new Set<string>();
  const series = value.series.map((match: unknown): DraftSeries => {
    if (!isRecord(match) || !isText(match.id) || seen.has(match.id) || !isText(match.event) || !isText(match.startedAt) ||
        !Number.isFinite(Date.parse(match.startedAt)) || !Array.isArray(match.teamIds) || match.teamIds.length !== 2 ||
        !(match.bestOf === 1 || match.bestOf === 3 || match.bestOf === 5 || match.bestOf === null) ||
        (match.draftFormat !== 'full-fearless' && match.draftFormat !== 'unknown') || !Array.isArray(match.games)) {
      throw new Error('A series has invalid or duplicate metadata.');
    }
    const [first, second] = match.teamIds as unknown[];
    if (!isText(first) || !isText(second) || first === second || !Object.hasOwn(teams, first) || !Object.hasOwn(teams, second)) {
      throw new Error('A series has missing, duplicate, or unknown teams.');
    }
    const teamIds: [string, string] = [first, second];
    const games = match.games.map((game: unknown) => readGame(game, teamIds, champions)).sort((a, b) => a.number - b.number);
    const bestOf = match.bestOf;
    if (new Set(games.map(game => game.id)).size !== games.length || new Set(games.map(game => game.number)).size !== games.length ||
        (bestOf !== null && games.some(game => game.number > bestOf))) {
      throw new Error('A series has duplicate game IDs, duplicate game numbers, or too many games.');
    }
    seen.add(match.id);
    return { id: match.id, event: match.event, startedAt: match.startedAt, teamIds, bestOf, draftFormat: match.draftFormat, games };
  });
  if (!series.some(isReplaySeries)) throw new Error('This file has no Full Fearless best-of-five series. Export a covered LCS playoff series.');
  return { version: 1, source: value.source, teams, champions, series };
}

export function isReplaySeries(series: DraftSeries) {
  return series.bestOf === 5 && series.draftFormat === 'full-fearless';
}

export function getReplaySeries(pack: DraftPack) {
  const replays = pack.series.filter(isReplaySeries);
  const usefulness = (series: DraftSeries) =>
    (getCheckpoint(series, 5).kind === 'ready' ? 4 : getCheckpoint(series, 4).kind === 'ready' ? 3 : getCheckpoint(series, 3).kind === 'ready' ? 2 : 0) * 2 +
    Number(series.teamIds.some(id => isCloud9(pack.teams[id])));
  return replays.sort((a, b) => usefulness(b) - usefulness(a) || Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function isCloud9(name: string) {
  return /^(cloud\s?9|c9)(\b|$)/i.test(name);
}

function getPrefix(series: DraftSeries, count: number) {
  const picks = new Set<string>();
  for (let number = 1; number <= count; number++) {
    const game = series.games.find(entry => entry.number === number);
    if (!game?.coverage.picks) return { missing: number } as const;
    for (const { championId, kind } of game.actions) {
      if (kind !== 'pick') continue;
      if (picks.has(championId)) return { missing: number } as const;
      picks.add(championId);
    }
  }
  return { picks } as const;
}

export function getCheckpoint(series: DraftSeries, target: Checkpoint) {
  if (series.draftFormat !== 'full-fearless' || series.bestOf !== 5) return { kind: 'unsupported' } as const;
  const previousGames = series.games.filter(game => game.number < target);
  if (series.teamIds.some(team => previousGames.filter(game => game.winnerId === team).length >= 3)) return { kind: 'ended' } as const;
  const prefix = getPrefix(series, target - 1);
  if ('missing' in prefix) return { kind: 'missing', game: prefix.missing } as const;
  const previous = previousGames.find(game => game.number === target - 1)!;
  return { kind: 'ready', previous, locks: prefix.picks } as const;
}

export type ReadyCheckpoint = Extract<ReturnType<typeof getCheckpoint>, { kind: 'ready' }>;

export function getObservedPool(pack: DraftPack, series: DraftSeries, previous: DraftGame) {
  if (!previous.patch) return [];
  const observed = new Set<string>();
  for (const other of pack.series) {
    if (other.id === series.id || other.event !== series.event || Date.parse(other.startedAt) >= Date.parse(series.startedAt)) continue;
    for (const game of other.games) {
      if (game.patch !== previous.patch) continue;
      for (const action of game.actions) {
        if (action.kind === 'pick' ? game.coverage.picks : game.coverage.bans) observed.add(action.championId);
      }
    }
  }
  if (previous.coverage.bans) {
    for (const action of previous.actions) if (action.kind === 'ban') observed.add(action.championId);
  }
  return [...observed].sort((a, b) => pack.champions[a].localeCompare(pack.champions[b]));
}

export function getSwapOptions(checkpoint: ReadyCheckpoint, observed: readonly string[], disabled: ReadonlySet<string>) {
  const { previous, locks } = checkpoint;
  if (!previous.coverage.bans || !previous.patch) return [];
  const banned = new Set(previous.actions.filter(action => action.kind === 'ban').map(action => action.championId));
  return observed.filter(id => !locks.has(id) && !banned.has(id) && !disabled.has(id));
}

export function compareSwap(checkpoint: ReadyCheckpoint, original: string, replacement: string, options: readonly string[]) {
  const previousPick = checkpoint.previous.actions.some(action => action.kind === 'pick' && action.championId === original);
  if (!previousPick || !options.includes(replacement) || checkpoint.locks.has(replacement)) return null;
  const locks = new Set(checkpoint.locks);
  locks.delete(original);
  locks.add(replacement);
  return { reopened: original, locked: replacement, locks };
}

export function getPlanOptions(swap: NonNullable<ReturnType<typeof compareSwap>>, observed: readonly string[], disabled: ReadonlySet<string>) {
  const candidates = new Set([swap.reopened, ...observed]);
  return [...candidates].filter(id => !swap.locks.has(id) && !disabled.has(id));
}

export function getBackupOptions(swap: NonNullable<ReturnType<typeof compareSwap>>, observed: readonly string[], disabled: ReadonlySet<string>, primary = swap.reopened) {
  return getPlanOptions(swap, observed, disabled).filter(id => id !== primary);
}

type HistoryEntry = { series: DraftSeries; game: DraftGame; priorLocks: ReadonlySet<string> };

export function getHistory(pack: DraftPack, reference: DraftSeries, teamId: string, cohort: Cohort, patch?: string) {
  const included: HistoryEntry[] = [];
  let excluded = 0;
  const older = pack.series.filter(series => series.id !== reference.id && series.teamIds.includes(teamId) &&
    series.draftFormat === 'full-fearless' && Date.parse(series.startedAt) < Date.parse(reference.startedAt));
  older.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  for (const series of older) {
    const games = [...series.games].sort((a, b) => b.number - a.number);
    for (const game of games) {
      if ((typeof cohort === 'number' && game.number !== cohort) || (cohort === 'Late series' && game.number < 3) || (patch && game.patch !== patch)) continue;
      const prefix = getPrefix(series, game.number - 1);
      if ('missing' in prefix || (!game.coverage.picks && !game.coverage.bans) ||
          game.actions.some(action => (action.kind === 'pick' ? game.coverage.picks : game.coverage.bans) && prefix.picks.has(action.championId))) {
        excluded++;
      } else {
        included.push({ series, game, priorLocks: prefix.picks });
      }
    }
  }
  return { entries: included.slice(0, 20), excluded };
}

export function evidenceFor(entries: readonly HistoryEntry[], teamId: string, champion: string) {
  const samples = entries.map(({ series, game, priorLocks }) => ({
    series,
    game,
    locked: priorLocks.has(champion),
    picked: game.coverage.picks ? game.actions.some(action => action.kind === 'pick' && action.teamId === teamId && action.championId === champion) : null,
    banned: game.coverage.bans ? game.actions.some(action => action.kind === 'ban' && action.teamId === teamId && action.championId === champion) : null,
  }));
  const rows = samples.filter(row => !row.locked);
  return {
    rows,
    samples,
    picks: { count: rows.filter(row => row.picked === true).length, eligible: rows.filter(row => row.picked !== null).length },
    bans: { count: rows.filter(row => row.banned === true).length, eligible: rows.filter(row => row.banned !== null).length },
  };
}
