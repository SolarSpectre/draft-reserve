import assert from 'node:assert/strict';
import test from 'node:test';
import { compareSwap, evidenceFor, getBackupOptions, getCheckpoint, getHistory, getObservedPool, getPlanOptions, getSwapOptions, parsePack } from '../src/draft.ts';
import { demoPack } from '../src/demo.ts';
import { championImage } from '../src/champion-art.ts';

const draftPack = () => parsePack(structuredClone(demoPack));

test('champion portraits resolve to official filenames independently of display punctuation', () => {
  assert.match(championImage('K’Sante'), /\/KSante\.png$/);
  assert.match(championImage('Wukong'), /\/MonkeyKing\.png$/);
  assert.equal(championImage('Unknown champion'), undefined);
  for (const name of Object.values(demoPack.champions)) assert.ok(championImage(name), name);
});

test('the same Fearless lockout applies to both teams, and a legal Game 4 swap changes exactly two names', () => {
  const pack = draftPack();
  const series = pack.series[0];
  const thirdGame = getCheckpoint(series, 3);
  const fifthGame = getCheckpoint(series, 5);
  assert.equal(thirdGame.kind, 'ready');
  assert.equal(fifthGame.kind, 'ready');
  assert.equal(thirdGame.locks.size, 20);
  assert.equal(fifthGame.locks.size, 40);
  assert.ok(fifthGame.locks.has('vale'), 'Emberline picks lock for Northstar too');
  assert.equal(fifthGame.locks.has('nerith'), false, 'A standard ban expires after its game');
  const pool = getObservedPool(pack, series, fifthGame.previous);
  const options = getSwapOptions(fifthGame, pool, new Set());
  assert.ok(options.includes('vesper'));
  assert.ok(!options.includes('nerith'), 'A Game 4 ban still blocks a replacement in that game');
  assert.ok(!options.includes('vale'), 'A second copy of an existing pick cannot enter the draft');
  const swap = compareSwap(fifthGame, 'morrow', 'vesper', options);
  assert.equal(swap?.reopened, 'morrow');
  assert.equal(swap?.locked, 'vesper');
  assert.equal(swap?.locks.size, 40);
  assert.equal(swap?.locks.has('morrow'), false);
  assert.equal(compareSwap(fifthGame, 'morrow', 'vale', options), null);
  assert.equal(getSwapOptions(fifthGame, pool, new Set(['vesper'])).includes('vesper'), false);
});

test('a verified Game 4 ban cannot replace a pick in Game 4 but is available as a Game 5 backup', () => {
  const pack = draftPack();
  const series = pack.series[0];
  const checkpoint = getCheckpoint(series, 5);
  assert.equal(checkpoint.kind, 'ready');
  const pool = getObservedPool(pack, series, checkpoint.previous);
  const options = getSwapOptions(checkpoint, pool, new Set());
  assert.ok(!options.includes('nerith'));
  const swap = compareSwap(checkpoint, 'morrow', 'vesper', options);
  assert.ok(swap);
  const backups = getBackupOptions(swap, pool, new Set());
  assert.ok(backups.includes('nerith'));
  assert.ok(!backups.includes('morrow'));
  assert.ok(!backups.includes('vesper'));
  assert.ok(!getBackupOptions(swap, pool, new Set(['nerith'])).includes('nerith'));
});

test('a coaching plan can use the reopened pick or another verified champion, with a distinct backup', () => {
  const pack = draftPack();
  const [series] = pack.series;
  const checkpoint = getCheckpoint(series, 5);
  assert.equal(checkpoint.kind, 'ready');
  const pool = getObservedPool(pack, series, checkpoint.previous);
  const swap = compareSwap(checkpoint, 'morrow', 'vesper', getSwapOptions(checkpoint, pool, new Set()));
  assert.ok(swap);
  const restricted = new Set(['ilex']);
  const primary = getPlanOptions(swap, pool.filter(id => id !== 'morrow'), restricted);
  assert.ok(primary.includes('morrow'), 'The recorded pick supplies evidence that it was playable');
  assert.ok(!primary.includes('vesper') && !primary.includes('ilex'));
  const backups = getBackupOptions(swap, pool, restricted, 'calder');
  assert.ok(backups.includes('morrow'));
  assert.ok(!backups.includes('calder'));
  assert.ok(!getPlanOptions(swap, pool, new Set(['morrow'])).includes('morrow'));
});

test('a sweep and incomplete draft feed produce different checkpoint states', () => {
  const [series] = draftPack().series;
  const [first, , third, fourth] = series.games;
  assert.deepEqual(getCheckpoint({ ...series, games: [first, third, fourth] }, 5), { kind: 'missing', game: 2 });
  const sweep = series.games.slice(0, 3).map(game => ({ ...game, winnerId: series.teamIds[0] }));
  assert.deepEqual(getCheckpoint({ ...series, games: sweep }, 4), { kind: 'ended' });
});

test('a swap needs complete bans, a known patch, and an earlier observation in the same event', () => {
  const pack = draftPack();
  const series = pack.series[0];
  const checkpoint = getCheckpoint(series, 5);
  assert.equal(checkpoint.kind, 'ready');
  const previous = checkpoint.previous;
  const pool = getObservedPool(pack, series, previous);
  assert.deepEqual(getSwapOptions({ ...checkpoint, previous: { ...previous, coverage: { picks: true, bans: false } } }, pool, new Set()), []);
  assert.deepEqual(getSwapOptions({ ...checkpoint, previous: { ...previous, patch: null } }, pool, new Set()), []);
  const isolated = { ...pack, series: [series, { ...pack.series[1], event: 'Unrelated event' }, { ...pack.series[2], startedAt: '2027-01-01T00:00:00Z' }] };
  assert.deepEqual(getSwapOptions(checkpoint, getObservedPool(isolated, series, previous), new Set()), []);
});

test('scouting drops games after a gap and counts known picks and bans separately', () => {
  const pack = draftPack();
  const [reference, old] = pack.series;
  const complete = getHistory({ ...pack, series: [reference, old] }, reference, 'emberline', 'Late series');
  assert.deepEqual(complete.entries.map(({ game }) => game.number), [5, 4, 3]);
  assert.equal(evidenceFor(complete.entries, 'emberline', 'morrow').picks.count, 1);
  assert.equal(evidenceFor(complete.entries, 'emberline', 'morrow').picks.eligible, 1, 'Morrow was locked after Game 3');
  old.games[2].coverage.bans = false;
  const partial = getHistory({ ...pack, series: [reference, old] }, reference, 'emberline', 'Late series');
  assert.deepEqual(evidenceFor(partial.entries, 'emberline', 'morrow').bans, { count: 0, eligible: 0 });
  old.games.splice(1, 1);
  const missing = getHistory({ ...pack, series: [reference, old] }, reference, 'emberline', 'Late series');
  assert.equal(missing.entries.length, 0);
  assert.equal(missing.excluded, 3);
});

test('the latest 20 scouting games exclude the current series, future series and other patches when requested', () => {
  const pack = draftPack();
  const [reference, old] = pack.series;
  pack.series = [reference, ...Array.from({ length: 13 }, (_, index) => ({
    ...old,
    id: `earlier-${index}`,
    startedAt: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  })), { ...old, id: 'future', startedAt: '2027-01-01T00:00:00Z' }];
  const earlier = getHistory(pack, reference, 'emberline', 'Late series');
  assert.equal(earlier.entries.length, 20);
  assert.equal(earlier.entries[0].series.id, 'earlier-12');
  assert.equal(earlier.entries[0].game.number, 5);
  assert.ok(earlier.entries.every(({ game, series }) => game.number >= 3 && series.id.startsWith('earlier-')));
  const exactGame = getHistory(pack, reference, 'emberline', 3);
  assert.equal(exactGame.entries.length, 13, 'Apply the game filter before the 20-game cap');
  assert.ok(exactGame.entries.every(({ game, series }) => game.number === 3 && series.id.startsWith('earlier-')));
  assert.equal(getHistory(pack, reference, 'emberline', 'All games', '99.99').entries.length, 0);
});

test('Game 5 scouting keeps lockout evidence and distinguishes no sample from no picks', () => {
  const pack = draftPack();
  const [reference] = pack.series;
  const earlier = getHistory(pack, reference, 'emberline', 5);
  const azir = evidenceFor(earlier.entries, 'emberline', 'morrow');
  assert.deepEqual(azir.picks, { count: 0, eligible: 0 });
  assert.ok(azir.samples.length > 0 && azir.samples.every(row => row.locked && row.game.number === 5));
  assert.deepEqual(evidenceFor(earlier.entries, 'emberline', 'brunna').picks, { count: 0, eligible: earlier.entries.length });
});

test('the import rejects malformed schemas and claimed picks with unknown IDs', () => {
  assert.throws(() => parsePack({ version: 2 }), /version 1/);
  const unknown = structuredClone(demoPack);
  unknown.series[0].games[0].actions[0].championId = 'missing';
  assert.throws(() => parsePack(unknown), /unknown champion/);
  const incomplete = structuredClone(demoPack);
  incomplete.series[0].games[0].actions.pop();
  assert.throws(() => parsePack(incomplete), /five distinct picks per team/);
});
