import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { domAnimation, LazyMotion, m, MotionConfig, useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowRight, Check, ChevronDown, ChevronRight, Copy, FileUp, LockKeyhole, Play, RotateCcw, UnlockKeyhole, X } from 'lucide-react';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import { compareSwap, evidenceFor, getBackupOptions, getCheckpoint, getHistory, getObservedPool, getReplaySeries, getSwapOptions, isCloud9, parsePack, type Checkpoint, type Cohort, type DraftPack, type DraftSeries } from './draft';
import { demoPack, demoSeriesId } from './demo';
import { championImage } from './champion-art';
import './styles.css';

type Overlay = { kind: 'briefing' } | { kind: 'game'; number: number } | { kind: 'evidence'; champion: string } | { kind: 'restrictions' };
type Desk = { pack: DraftPack; series: DraftSeries; own: string; target: Checkpoint; pick: string; replacement: string; backup: string; disabled: string[] };
const staticMedia = `${import.meta.env.BASE_URL}media/`;
const formatDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const checkpoints = [3, 4, 5] as const;

function chooseDesk(pack: DraftPack, series?: DraftSeries, own?: string, target?: Checkpoint): Desk {
  const active = series ?? (pack.source === 'demo' ? pack.series.find(entry => entry.id === demoSeriesId) : undefined) ?? getReplaySeries(pack)[0];
  const team = own ?? active.teamIds.find(id => isCloud9(pack.teams[id])) ?? active.teamIds[0];
  const at = target ?? [...checkpoints].reverse().find(number => getCheckpoint(active, number).kind === 'ready') ?? 3;
  const game = active.games.find(entry => entry.number === at - 1);
  const firstPick = game?.actions.find(action => action.kind === 'pick' && action.teamId === team)?.championId ?? '';
  const narrative = active.id === demoSeriesId && team === 'northstar' && at === 5;
  return { pack, series: active, own: team, target: at, pick: narrative ? 'morrow' : firstPick, replacement: narrative ? 'vesper' : '', backup: '', disabled: [] };
}

function ChampionPortrait({ name, small = false }: { name?: string; small?: boolean }) {
  const src = name ? championImage(name) : undefined;
  const [broken, setBroken] = useState<string>();
  const size = small ? 28 : 72;
  return <span className={`champion-portrait${small ? ' portrait-small' : ''}`} aria-hidden="true">
    {name ? [...name][0] : '—'}
    {src && src !== broken && <img src={src} width={size} height={size} alt="" decoding="async" loading={small ? 'lazy' : 'eager'} onError={() => setBroken(src)} />}
  </span>;
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={close} onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
      <div className="dialog-content">
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={() => ref.current?.close()}><X size={20} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function EvidenceCount({ count, eligible }: { count: number; eligible: number }) {
  return eligible ? <>{count}<span>/{eligible}</span></> : <span aria-label="No covered drafts">—</span>;
}

function App() {
  const [desk, setDesk] = useState(() => chooseDesk(demoPack));
  const [cohort, setCohort] = useState<Cohort>('Late series');
  const [samePatch, setSamePatch] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [importError, setImportError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [replay, setReplay] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLSelectElement>(null);
  const importSequence = useRef(0);
  const reducedMotion = useReducedMotion();
  const { pack, series, own, target, pick, replacement, disabled } = desk;
  const { teams, champions } = pack;
  const opponent = series.teamIds.find(id => id !== own)!;
  const ownName = teams[own];
  const opponentName = teams[opponent];
  const isGrid = pack.source === 'grid';
  const status = getCheckpoint(series, target);
  const checkpoint = status.kind === 'ready' ? status : null;
  const previous = series.games.find(game => game.number === target - 1);
  const previousPatch = previous?.patch ?? undefined;
  const replaySeries = getReplaySeries(pack);
  const scores = series.teamIds.map(id => series.games.filter(game => game.number < target && game.winnerId === id).length);
  const scoreComplete = scores[0] + scores[1] === target - 1;
  const observedPool = checkpoint ? getObservedPool(pack, series, checkpoint.previous) : [];
  const restrictions = observedPool.filter(id => !checkpoint?.locks.has(id));
  const excluded = new Set(disabled);
  const options = checkpoint ? getSwapOptions(checkpoint, observedPool, excluded) : [];
  const swap = checkpoint && replacement ? compareSwap(checkpoint, pick, replacement, options) : null;
  const backupOptions = swap ? getBackupOptions(swap, observedPool, excluded) : [];
  const demoBackup = ['ilex', 'calder'].find(id => pack.source === 'demo' && backupOptions.includes(id));
  const backup = backupOptions.includes(desk.backup) ? desk.backup : demoBackup ?? '';
  const eligiblePicks = checkpoint?.previous.actions.filter(action => action.kind === 'pick' && action.teamId === own) ?? [];
  const history = getHistory(pack, series, opponent, cohort, samePatch ? previousPatch : undefined);
  const dates = history.entries.map(({ series: entry }) => Date.parse(entry.startedAt));
  const reserveEvidence = evidenceFor(history.entries, opponent, pick);
  const observed = new Set(history.entries.flatMap(({ game }) => game.actions.filter(action => action.teamId === opponent).map(action => action.championId)));
  const ranked = [...observed].map(id => ({ id, ...evidenceFor(history.entries, opponent, id) })).filter(row => row.picks.count + row.bans.count > 0)
    .sort((a, b) => (b.picks.count / (b.picks.eligible || 1) - a.picks.count / (a.picks.eligible || 1)) || (b.bans.count - a.bans.count) || champions[a.id].localeCompare(champions[b.id]));
  const visibleIds = [...new Set([pick, replacement, ...ranked.map(row => row.id)].filter(Boolean))].slice(0, 4);
  const displayRanks = visibleIds.map(id => ({ id, ...evidenceFor(history.entries, opponent, id) }));
  const details = overlay?.kind === 'game' ? series.games.find(game => game.number === overlay.number) : undefined;
  const reserveSample = reserveEvidence.picks.eligible
    ? `${teams[opponent]} picked ${champions[pick]} in ${reserveEvidence.picks.count} of ${reserveEvidence.picks.eligible} covered eligible drafts${reserveEvidence.picks.eligible < 5 ? ' (sparse sample)' : ''}.`
    : `${teams[opponent]} has no verified eligible pick sample for ${champions[pick]}.`;
  const prepDetail = swap
    ? `Use ${champions[replacement]} in Game ${target - 1}. ${reserveSample} ${backup ? `If they take ${champions[pick]}, keep ${champions[backup]} as your backup.` : 'Choose a backup from the unlocked pool.'}`
    : pick && checkpoint ? `${champions[pick]} stays locked for both teams in the recorded draft.` : 'Select a checkpoint with enough draft coverage to make a prep note.';
  const prepTitle = swap ? `Save ${champions[pick]} for Game ${target}.` : 'Start from the recorded draft.';
  const prepNote = `${prepTitle} ${prepDetail}`;

  function selectDesk(next: Desk) {
    setDesk(next);
    setCopyStatus('');
  }

  function editDesk(changes: Partial<Pick<Desk, 'pick' | 'replacement' | 'backup' | 'disabled'>>) {
    setDesk(current => ({ ...current, ...changes }));
    setCopyStatus('');
  }

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    const attempt = ++importSequence.current;
    setImportError('');
    try {
      const imported = parsePack(JSON.parse(await file.text()));
      if (attempt !== importSequence.current) return;
      selectDesk(chooseDesk(imported));
      setCohort('Late series');
      setSamePatch(false);
    } catch (error) {
      if (attempt !== importSequence.current) return;
      if (error instanceof SyntaxError) {
        setImportError('This file is not valid JSON. Choose an export from the GRID importer.');
      } else {
        setImportError(error instanceof Error ? error.message : 'The draft export could not be read.');
      }
    }
  }

  function useDemo() {
    importSequence.current++;
    selectDesk(chooseDesk(demoPack));
    setCohort('Late series');
    setSamePatch(false);
    setImportError('');
  }

  function toggleRestriction(id: string) {
    const removed = disabled.includes(id);
    editDesk({ disabled: removed ? disabled.filter(item => item !== id) : [...disabled, id],
      replacement: !removed && replacement === id ? '' : replacement,
      backup: !removed && desk.backup === id ? '' : desk.backup });
  }

  async function copyPrepNote() {
    try {
      await navigator.clipboard.writeText(prepNote);
      setCopyStatus('Prep note copied');
    } catch {
      setCopyStatus('Select the prep note text to copy it.');
    }
  }

  function goToComparison() {
    document.getElementById('change-pick')?.scrollIntoView({ block: 'nearest' });
    if (replacementInput.current && !replacementInput.current.disabled) replacementInput.current.focus({ preventScroll: true });
  }

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <a className="skip-link" href="#draft-desk">Skip to the draft controls</a>
      <header className="masthead">
        <div className="wrap masthead-inner">
          <a className="wordmark" href="#top"><span className="brand-mark" aria-hidden="true" />Draft Reserve</a>
          <nav aria-label="Workspace"><a className="nav-current" href="#draft-desk">Series replay</a><a href="#scouting">Scouting</a></nav>
          <span className="source-label"><i aria-hidden="true" />{isGrid ? 'Local GRID data' : 'Fictional series'}</span>
        </div>
      </header>

      <main id="top" className="wrap">
        <div className="replay-title" data-enter>
          <div>
            <p className="section-label">Full Fearless Draft</p>
            <h1>Game {target} replay</h1>
          </div>
          <div className="title-actions">
            <button className="subtle-button header-briefing" type="button" onClick={() => setOverlay({ kind: 'briefing' })}><Play size={14} aria-hidden="true" /> Watch briefing</button>
            <button type="button" className="primary-button" onClick={goToComparison}>Compare a pick <ArrowDownRight size={17} aria-hidden="true" /></button>
          </div>
        </div>

        <div className="data-controls" aria-label="Draft dataset">
          {isGrid && <p className="data-source">{series.event} · {formatDate.format(new Date(series.startedAt))}</p>}
          <label className="data-field"><span id="series-field-label">Series</span><select aria-labelledby="series-field-label" value={series.id} onChange={event => selectDesk(chooseDesk(pack, replaySeries.find(item => item.id === event.target.value)))}>
            {replaySeries.map(item => <option key={item.id} value={item.id}>{teams[item.teamIds[0]]} vs {teams[item.teamIds[1]]}{pack.source === 'grid' ? ` · ${formatDate.format(new Date(item.startedAt))}` : ''}</option>)}
          </select></label>
          <label className="data-field"><span id="our-team-label">Our team</span><select aria-labelledby="our-team-label" value={own} onChange={event => selectDesk(chooseDesk(pack, series, event.target.value, target))}>{series.teamIds.map(id => <option key={id} value={id}>{teams[id]}</option>)}</select></label>
          <div className="data-buttons">
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Draft export JSON" onChange={loadFile} />
            <button type="button" className="subtle-button" onClick={() => fileInput.current?.click()}><FileUp size={15} /> Import draft file</button>
            {pack !== demoPack && <button type="button" className="subtle-button" onClick={useDemo}>Return to demo</button>}
          </div>
          {importError && <p className="import-error" role="alert">{importError} Your current draft stays open.</p>}
        </div>

        <section className="broadcast-board" id="draft-desk" aria-label="Fearless Draft replay board">
          <div className="scoreboard" role="group" aria-label={`Score entering Game ${target}`}>
            <div className="score-team score-first"><span className="team-mark" aria-hidden="true">{teams[series.teamIds[0]][0]}</span><span>{teams[series.teamIds[0]]}</span><strong>{scoreComplete ? scores[0] : '—'}</strong></div>
            <div className="score-center"><span>Best of five</span><strong>Game {target}</strong></div>
            <div className="score-team score-second"><strong>{scoreComplete ? scores[1] : '—'}</strong><span>{teams[series.teamIds[1]]}</span><span className="team-mark" aria-hidden="true">{teams[series.teamIds[1]][0]}</span></div>
          </div>
          <nav className="rounds" aria-label="Recorded series drafts">
            {[1, 2, 3, 4, 5].map(number => {
              const game = series.games.find(entry => entry.number === number);
              if (number === target) return <a key={number} className="round current-round" href="#change-pick" aria-current="step">Game {number}</a>;
              return <button key={number} type="button" className="round" disabled={!game} aria-label={`View Game ${number} draft${game?.winnerId ? `, ${teams[game.winnerId]} won` : ''}`} onClick={() => setOverlay({ kind: 'game', number })}>Game {number}</button>;
            })}
          </nav>
          <div className="desk-grid">
          <section className="draft-panel" id="change-pick" aria-labelledby="draft-heading">
            <div className="panel-heading">
              <div><span className="section-label">Game {target - 1} · {ownName}</span><h2 id="draft-heading">Change the pick</h2></div>
              {checkpoint && <span className="lock-count"><b>{checkpoint.locks.size}</b> Game {target} lockouts</span>}
            </div>
            {checkpoint ? <>
              <div className="scenarios">
                <div className="scenario recorded">
                  <ChampionPortrait name={champions[pick]} />
                  <div className="pick-control"><label htmlFor="recorded-pick">Recorded pick</label><div className="select-wrap"><select id="recorded-pick" value={pick} onChange={event => editDesk({ pick: event.target.value, replacement: '', backup: '' })}>
                      {eligiblePicks.map(action => <option value={action.championId} key={action.championId}>{champions[action.championId]}</option>)}
                  </select><ChevronDown size={16} aria-hidden="true" /></div></div>
                </div>
                <ArrowRight className="swap-arrow" size={18} aria-hidden="true" />
                <div className="scenario what-if">
                  <ChampionPortrait name={champions[replacement]} />
                  <div className="pick-control"><label htmlFor="replacement">Replacement</label>
                    <div className="select-wrap"><select ref={replacementInput} id="replacement" disabled={!options.length} value={replacement} onChange={event => editDesk({ replacement: event.target.value, backup: '' })}>
                        <option value="">Choose a pick</option>
                        {options.map(id => <option key={id} value={id}>{champions[id]}</option>)}
                    </select><ChevronDown size={16} aria-hidden="true" /></div>
                  </div>
                </div>
              </div>
              <div className="impact" aria-live="polite">
                {swap ? <m.div className="impact-row" key={`${pick}-${replacement}-${replay}`} initial={{ opacity: 0.45, y: reducedMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.32 }}>
                  <div className="impact-cell reopened"><UnlockKeyhole size={16} aria-hidden="true" /><span><strong>{champions[swap.reopened]} reopens</strong><small>For both teams</small></span></div>
                  <div className="impact-cell newly-locked"><LockKeyhole size={16} aria-hidden="true" /><span><strong>{champions[swap.locked]} locks</strong><small>For both teams</small></span></div>
                </m.div> : <p className="empty-impact">{!checkpoint.previous.coverage.bans ? `Game ${target - 1} bans are incomplete. The swap is unavailable.` : !previousPatch ? 'The patch is unknown. The swap is unavailable.' : !options.length ? 'There are no verified alternatives from earlier drafts on this event and patch.' : `Choose a replacement to see the Game ${target} impact.`}</p>}
              </div>
              <div className="replay-actions">
                {swap && <><button className="outline-button" type="button" onClick={() => setReplay(value => value + 1)}><Play size={14} fill="currentColor" aria-hidden="true" /> Replay swap</button>
                <button className="subtle-button" type="button" onClick={() => editDesk({ replacement: '', backup: '' })}><RotateCcw size={14} aria-hidden="true" /> Reset</button></>}
                <span>Game {target} pool before standard bans</span>
              </div>
            </> : <p className="empty-impact" role="status">{status.kind === 'ended' ? `Game ${target} was not played. The series ended before this checkpoint.` : status.kind === 'missing' ? `Game ${status.game} picks are missing or incomplete. Game ${target} lockouts cannot be verified.` : 'This series cannot be replayed.'}</p>}
            <div className="draft-controls">
              <div className="segmented checkpoint-control" role="group" aria-label="Target game">{checkpoints.map(number => <button key={number} type="button" aria-pressed={target === number} onClick={() => selectDesk({ ...chooseDesk(pack, series, own, number), disabled })}>Game {number}</button>)}</div>
              <button className="subtle-button" type="button" disabled={!restrictions.length} onClick={() => setOverlay({ kind: 'restrictions' })}>Tournament restrictions{disabled.length > 0 ? ` (${disabled.length})` : ''}</button>
            </div>
          </section>

          <section className="scout-panel" id="scouting" aria-labelledby="scout-heading">
            <div className="panel-heading scout-heading"><div><span className="section-label">{opponentName} scouting</span><h2 id="scout-heading">{cohort === 'Late series' ? 'Late-series picks and bans' : 'All-game picks and bans'}</h2></div></div>
            <div className="segmented" role="group" aria-label="Scouting sample">
              {(['Late series', 'All games'] as const).map(option => <button type="button" key={option} aria-pressed={cohort === option} onClick={() => { setCohort(option); setCopyStatus(''); }}>{option}</button>)}
            </div>
            <label className="patch-filter"><input type="checkbox" checked={Boolean(previousPatch) && samePatch} disabled={!previousPatch} onChange={event => { setSamePatch(event.target.checked); setCopyStatus(''); }} /> Same patch{previousPatch ? ` (${previousPatch})` : ''}</label>
            <div className="stats-heading"><span>{cohort === 'Late series' ? 'Games 3–5' : 'Games 1–5'}</span><span>Picks / eligible</span><span>Bans / eligible</span></div>
            {history.entries.length ? <ul className="stats-list">
              {displayRanks.map(({ id, picks, bans }) => <li key={id} className={id === pick ? 'reserve-stat' : ''}>
                <button type="button" aria-label={`${champions[id]}, ${picks.count} picks in ${picks.eligible} eligible drafts, ${bans.count} bans in ${bans.eligible} eligible drafts. View evidence`} onClick={() => setOverlay({ kind: 'evidence', champion: id })}>
                  <ChampionPortrait name={champions[id]} small /><span className="stats-name">{champions[id]}{Math.min(picks.eligible, bans.eligible) < 5 && <small>Sparse</small>}</span>
                  <span className="stat-track" aria-hidden="true"><m.span initial={false} animate={{ scaleX: picks.eligible ? picks.count / picks.eligible : 0 }} transition={{ duration: reducedMotion ? 0 : 0.28 }} /></span>
                  <strong><EvidenceCount {...picks} /></strong><strong><EvidenceCount {...bans} /></strong><ChevronRight size={13} className="stat-chevron" />
                </button>
              </li>)}
            </ul> : <p className="empty-impact">No covered earlier drafts match this scout filter.</p>}
            <p className="sample-note">{history.entries.length} covered {history.entries.length === 1 ? 'game' : 'games'}{dates.length > 0 && ` · ${formatDate.formatRange(new Date(Math.min(...dates)), new Date(Math.max(...dates)))}`}{history.excluded > 0 && ` · ${history.excluded} excluded for coverage`}. Eligibility excludes prior Fearless lockouts.</p>
          </section>
          </div>
        </section>

        <section className="prep" aria-labelledby="prep-heading">
          <div><span className="section-label">Game {target} prep note</span><h2 id="prep-heading">{prepTitle}</h2><p>{prepDetail}</p></div>
          <div className="prep-actions">
            {swap && backupOptions.length > 0 && <label className="data-field"><span id="backup-field-label">Backup</span><select aria-labelledby="backup-field-label" value={backup} onChange={event => editDesk({ backup: event.target.value })}>
              {!demoBackup && <option value="">Choose a champion</option>}{backupOptions.map(id => <option key={id} value={id}>{champions[id]}</option>)}
            </select></label>}
            <button className="outline-button" type="button" onClick={copyPrepNote} disabled={!checkpoint}>{copyStatus === 'Prep note copied' ? <Check size={16} /> : <Copy size={15} />} Copy prep note</button><span role="status">{copyStatus}</span>
          </div>
        </section>
        <footer>
          <p>Champion images from <a href="https://developer.riotgames.com/docs/lol#data-dragon">Riot Data Dragon</a>. Match data provided by GRID when a local export is loaded.</p>
          <p>Draft Reserve is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
        </footer>
      </main>

      {overlay?.kind === 'briefing' && <Dialog title="Game 5 briefing" close={() => setOverlay(null)}>
        <video className="briefing-video" controls autoPlay={!reducedMotion} playsInline poster={`${staticMedia}river-crossing.webp`} preload="metadata" src={`${staticMedia}briefing.mp4`} aria-label="Animated Game 5 briefing" />
        <p className="dialog-note">Champions picked earlier in a Fearless series lock for both teams. Replace one Game 4 pick to see who returns to the Game 5 pool.</p>
      </Dialog>}
      {details && <Dialog title={`Game ${details.number} draft`} close={() => setOverlay(null)}>
        <p className="dialog-note">{details.winnerId ? `${teams[details.winnerId]} won.` : 'The winner is unknown.'} {details.coverage.picks ? 'Both teams carry these picks forward as lockouts.' : 'The feed has incomplete picks.'}</p>
        {details.actions.length > 0 && <ol className="game-actions" aria-label="Recorded draft order">
          {details.actions.map((action, index) => <li key={`${action.championId}-${index}`}>
            <span className="draft-order" aria-hidden="true">{index + 1}</span>
            <ChampionPortrait name={champions[action.championId]} small />
            <span><strong>{champions[action.championId]}</strong><small>{teams[action.teamId]}</small></span>
            <span>{action.kind === 'pick' ? 'Pick' : 'Ban'}</span>
          </li>)}
        </ol>}
      </Dialog>}
      {overlay?.kind === 'evidence' && <Dialog title={`${champions[overlay.champion]} scouting evidence`} close={() => setOverlay(null)}>
        <p className="dialog-note">{teams[opponent]} · {cohort} · Earlier covered drafts</p>
        <ul className="evidence-list">{evidenceFor(history.entries, opponent, overlay.champion).rows.map(row => <li key={`${row.series.id}-${row.game.id}`}><span>{formatDate.format(new Date(row.series.startedAt))} · {teams[row.series.teamIds.find(id => id !== opponent)!]} · Game {row.game.number}</span><strong>{row.picked ? 'Picked' : row.banned ? 'Banned' : row.picked === null || row.banned === null ? 'Partial coverage' : 'Passed'}</strong></li>)}</ul>
        {evidenceFor(history.entries, opponent, overlay.champion).rows.length === 0 && <p className="dialog-note">No eligible drafts in this sample.</p>}
      </Dialog>}
      {overlay?.kind === 'restrictions' && <Dialog title="Tournament restrictions" close={() => setOverlay(null)}>
        <p className="dialog-note">Exclude champions disabled for this series. Draft Reserve uses observed picks and bans as evidence for the patch and event.</p>
        <ul className="evidence-list restrictions-list">{restrictions.map(id => <li key={id}><label><input type="checkbox" checked={disabled.includes(id)} onChange={() => toggleRestriction(id)} /> {champions[id]}</label></li>)}</ul>
      </Dialog>}
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <LazyMotion features={domAnimation} strict><App /></LazyMotion>
);
