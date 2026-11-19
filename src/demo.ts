import type { DraftAction, DraftGame, DraftPack, DraftSeries } from './draft';

const names = [
  'Arden', 'Bram', 'Nera', 'Slate', 'Luma', 'Rook', 'Nyx', 'Cael', 'Vanta', 'Orrin',
  'Kestrel', 'Briar', 'Edda', 'Ansel', 'Luxen', 'Aven', 'Keir', 'Fen', 'Iskra', 'Flint',
  'Hale', 'Kova', 'Laurel', 'Cinder', 'Noor', 'Reeve', 'Sable', 'Iona', 'Ashen', 'Tern',
  'Drake', 'Talus', 'Morrow', 'Onyx', 'Wren', 'Vale', 'Briarwood', 'Axton', 'Solace', 'Pike',
  'Vesper', 'Ilex', 'Calder', 'Alder', 'Nerith', 'Sorin', 'Thorne', 'Lysander', 'Corven', 'Eris',
  'Gale', 'Mirth', 'Selka', 'Daxen', 'Kell', 'Soren', 'Vire', 'Aylen', 'Cairn', 'Brunna',
];
const key = (name: string) => name.toLowerCase();
const event = 'Fictional best of five';
const patch = '26.10';
const coverage = { picks: true, bans: true };
const referenceTeams: [string, string] = ['northstar', 'emberline'];

function makeGame(seriesId: string, number: number, teamIds: [string, string], winnerId: string, picks: string[], bans: string[]): DraftGame {
  const pickActions = picks.map((name, i): DraftAction => ({ kind: 'pick', teamId: teamIds[i < 5 ? 0 : 1], championId: key(name) }));
  const banActions = bans.map((name, i): DraftAction => ({ kind: 'ban', teamId: teamIds[i % 2], championId: key(name) }));
  return { id: `${seriesId}-${number}`, number, patch, winnerId, actions: [...banActions, ...pickActions], coverage };
}

const reference: DraftSeries = {
  id: 'northstar-emberline', event, startedAt: '2026-06-04T22:00:00Z', teamIds: referenceTeams, bestOf: 5, draftFormat: 'full-fearless',
  games: [0, 1, 1, 0].map((winner, index) => makeGame('northstar-emberline', index + 1, referenceTeams, referenceTeams[winner], names.slice(index * 10, (index + 1) * 10), names.slice(44, 54))),
};

const historyTeams = ['Ridge', 'Ford', 'Cove', 'Spires', 'Hollow', 'Harbor'];
const priorityPicks = [
  ['', '', 'Morrow', 'Vesper', 'Ilex'],
  ['', '', 'Vesper', 'Morrow', 'Calder'],
  ['Calder', '', 'Morrow', 'Ilex'],
  ['', '', 'Morrow', 'Vesper', 'Ilex'],
  ['Calder', 'Vesper', ''],
  ['Vesper', 'Ilex', 'Calder'],
];
const watched = new Set(['Morrow', 'Vesper', 'Ilex', 'Calder']);
const filler = names.filter(name => !watched.has(name));
const history = historyTeams.map((name, index): DraftSeries => {
  const id = key(name);
  const teamIds: [string, string] = [id, 'emberline'];
  const pool = [...filler];
  const used = new Set<string>();
  const games = priorityPicks[index].map((priority, game): DraftGame => {
    const picks = priority ? [...pool.splice(0, 9), priority] : pool.splice(0, 10);
    const bans = [...watched, ...filler].filter(champion => !used.has(champion) && !picks.includes(champion)).slice(0, 10);
    for (const pick of picks) used.add(pick);
    return makeGame(id, game + 1, teamIds, teamIds[game % 2], picks, bans);
  });
  return { id, event, startedAt: new Date(Date.UTC(2026, 4, 31 - index * 3)).toISOString(), teamIds, bestOf: 5, draftFormat: 'full-fearless', games };
});

export const demoPack: DraftPack = {
  version: 1,
  source: 'demo',
  teams: { northstar: 'Northstar', emberline: 'Emberline', ...Object.fromEntries(historyTeams.map(name => [key(name), name])) },
  champions: Object.fromEntries(names.map(name => [key(name), name])),
  series: [reference, ...history],
};

export const demoSeriesId = reference.id;
export const demoChampionStyle: Record<string, string> = { morrow: '#d6ae77', vesper: '#a5a0dc', ilex: '#8ecac0', calder: '#d4947c' };
