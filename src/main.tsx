import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { domAnimation, LazyMotion, m, MotionConfig, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowUpRight, Check, ChevronDown, Clapperboard, Copy, FileUp, ListFilter, LockKeyhole, Play, RotateCcw, UnlockKeyhole, X } from 'lucide-react';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import { compareSwap, evidenceFor, getBackupOptions, getCheckpoint, getHistory, getObservedPool, getPlanOptions, getReplaySeries, getSwapOptions, isCloud9, parsePack, type Checkpoint, type DraftGame, type DraftPack, type DraftSeries } from './draft';
import { demoPack, demoSeriesId } from './demo';
import { championImage } from './champion-art';
import './styles.css';

type EvidenceOverlay = { kind: 'evidence'; champion: string };
type Overlay = { kind: 'briefing' } | { kind: 'game'; series: DraftSeries; game: DraftGame; from?: EvidenceOverlay } | EvidenceOverlay | { kind: 'restrictions' };
type ScoutView = 'Target game' | 'Late series' | 'All games';
type Desk = {
  pack: DraftPack; series: DraftSeries; own: string; target: Checkpoint; disabled: string[];
  pick: string; replacement: string; plan: 'recorded' | 'swap'; primary: string; backup: string;
};
const staticMedia = `${import.meta.env.BASE_URL}media/`;
const momentLoader = `${import.meta.env.BASE_URL}assets/moments/moments.js`;
const featuredChampions = new Set(['Azir', 'Orianna', 'Taliyah', 'Syndra']);
const comparisonSplashes = new Map([['Azir', 'azir-splash.jpg'], ['Orianna', 'orianna-splash.jpg']]);
const formatDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const checkpoints = [3, 4, 5] as const;

function chooseDesk(pack: DraftPack, series?: DraftSeries, own?: string, target?: Checkpoint): Desk {
  const active = series ?? (pack.source === 'demo' ? pack.series.find(entry => entry.id === demoSeriesId) : undefined) ?? getReplaySeries(pack)[0];
  const team = own ?? active.teamIds.find(id => isCloud9(pack.teams[id])) ?? active.teamIds[0];
  const at = target ?? [...checkpoints].reverse().find(number => getCheckpoint(active, number).kind === 'ready') ?? 3;
  const game = active.games.find(entry => entry.number === at - 1);
  const firstPick = game?.actions.find(action => action.kind === 'pick' && action.teamId === team)?.championId ?? '';
  const narrative = pack.source === 'demo' && active.id === demoSeriesId && team === 'northstar' && at === 5 && target === undefined;
  return {
    pack, series: active, own: team, target: at, disabled: [],
    pick: narrative ? 'morrow' : firstPick, replacement: narrative ? 'vesper' : '',
    plan: narrative ? 'swap' : 'recorded', primary: narrative ? 'morrow' : '', backup: narrative ? 'ilex' : '',
  };
}

function ChampionPortrait({ name, small = false }: { name?: string; small?: boolean }) {
  const src = name ? (featuredChampions.has(name) ? `${staticMedia}${name}.jpg` : championImage(name)) : undefined;
  const [broken, setBroken] = useState<string>();
  const size = small ? 28 : 72;
  return <span className={`champion-portrait${small ? ' portrait-small' : ''}`} aria-hidden="true">
    {name ? [...name][0] : '—'}
    {src && src !== broken && <img src={src} width={size} height={size} alt="" decoding="async" loading={small ? 'lazy' : 'eager'} onError={() => setBroken(src)} />}
  </span>;
}

function PickArt({ name }: { name?: string }) {
  const splash = name && comparisonSplashes.get(name);
  return <div className={`pick-art${name && featuredChampions.has(name) ? ' pick-art-featured' : ''}`} key={name} aria-hidden="true">
    {splash ? <img src={`${staticMedia}${splash}`} alt="" width={1215} height={717} decoding="async" /> : <ChampionPortrait name={name} />}
  </div>;
}

function ReplayTitle({ game, reducedMotion }: { game: Checkpoint; reducedMotion: boolean | null }) {
  const title = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    // React Bits Blur Text, adapted to two phrases and a single load trigger.
    const animation = gsap.context(() => {
      gsap.from('.title-word', { filter: 'blur(4px)', y: 6, opacity: 0.58, duration: 0.52, stagger: 0.075, ease: 'power2.out' });
    }, title);
    return () => animation.revert();
  }, [reducedMotion]);

  return <h1 id="replay-title" ref={title}><span className="title-word">Game {game}</span>{' '}<span className="title-word">draft replay</span></h1>;
}

function PoolImpact({ reopened, locked, restricted, reducedMotion }: { reopened: string; locked: string; restricted: boolean; reducedMotion: boolean | null }) {
  const row = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const animation = gsap.context(() => {
      gsap.timeline({ defaults: { ease: 'power2.out' } })
        .from('.impact-icon', { opacity: 0.45, y: 4, duration: 0.33, stagger: 0.12 }, 0)
        .fromTo('.impact-wash', { opacity: 0.2, xPercent: -90 }, { opacity: 0, xPercent: 75, duration: 0.55, stagger: 0.12 }, 0);
    }, row);
    return () => animation.revert();
  }, [reducedMotion]);

  return <div className="impact-row" ref={row}>
    <div className="impact-cell reopened">
      <span className="impact-wash" aria-hidden="true" />
      <span className="impact-icon"><UnlockKeyhole size={17} aria-hidden="true" /></span>
      <span><strong>{reopened} {restricted ? 'clears lockout' : 'reopens'}</strong><small>{restricted ? 'Restricted for this series' : 'Available to both teams'}</small></span>
    </div>
    <div className="impact-cell newly-locked">
      <span className="impact-wash" aria-hidden="true" />
      <span className="impact-icon"><LockKeyhole size={17} aria-hidden="true" /></span>
      <span><strong>{locked} locks</strong><small>Unavailable to both teams</small></span>
    </div>
  </div>;
}

function Dialog({ title, close, back, children }: { title: string; close: () => void; back?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (dialog.open) {
      dialog.scrollTop = 0;
      heading.current?.focus();
    } else {
      dialog.showModal();
    }
  }, [title]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={close} onClick={event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    }}>
      <div className="dialog-content">
        {back && <button type="button" className="subtle-button dialog-back" onClick={back}><ArrowLeft size={16} aria-hidden="true" /> Back to evidence</button>}
        <div className="dialog-heading">
          <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={() => ref.current?.close()}><X size={20} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

function EvidenceCount({ count, eligible }: { count: number; eligible: number }) {
  return eligible ? <>{count}<span>/{eligible}</span></> : <span title="No eligible drafts">—</span>;
}

function scoutingCounts({ picks, bans }: ReturnType<typeof evidenceFor>) {
  return [
    picks.eligible ? `Picked in ${picks.count} of ${picks.eligible} eligible drafts.` : 'No eligible pick sample.',
    bans.eligible ? `Banned in ${bans.count} of ${bans.eligible} eligible drafts.` : 'No eligible ban sample.',
  ].join(' ');
}

function App() {
  const [desk, setDesk] = useState(() => chooseDesk(demoPack));
  const [scoutView, setScoutView] = useState<ScoutView>('Late series');
  const [samePatch, setSamePatch] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [importError, setImportError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [replay, setReplay] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const replacementInput = useRef<HTMLSelectElement>(null);
  const importSequence = useRef(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = momentLoader;
    script.onerror = () => console.warn('Could not load the scoreboard effect.');
    document.head.append(script);
    return () => script.remove();
  }, []);
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
  const excluded = new Set(disabled);
  const options = checkpoint ? getSwapOptions(checkpoint, observedPool, excluded) : [];
  const swap = checkpoint && replacement ? compareSwap(checkpoint, pick, replacement, options) : null;
  const restrictions = [...new Set([...observedPool.filter(id => !checkpoint?.locks.has(id)), ...(swap ? [swap.reopened] : []), ...disabled])];
  const primaryOptions = swap ? getPlanOptions(swap, observedPool, excluded) : [];
  const primary = primaryOptions.includes(desk.primary) ? desk.primary : '';
  const backupOptions = swap && primary ? getBackupOptions(swap, observedPool, excluded, primary) : [];
  const backup = backupOptions.includes(desk.backup) ? desk.backup : '';
  const useSwap = Boolean(swap) && desk.plan === 'swap';
  const reopenedRestricted = excluded.has(pick);
  const eligiblePicks = checkpoint?.previous.actions.filter(action => action.kind === 'pick' && action.teamId === own) ?? [];
  const scope = scoutView === 'Target game' ? `Game ${target}` : scoutView === 'Late series' ? 'Games 3–5' : 'Games 1–5';
  const patchFilter = samePatch ? previousPatch : undefined;
  const sampleLabel = `${scope}${patchFilter ? ` · Patch ${patchFilter}` : ''}`;
  const history = getHistory(pack, series, opponent, scoutView === 'Target game' ? target : scoutView, patchFilter);
  const dates = history.entries.map(({ series: entry }) => Date.parse(entry.startedAt));
  const reserveEvidence = evidenceFor(history.entries, opponent, pick);
  const observed = new Set(history.entries.flatMap(({ game }) => game.actions.filter(action => action.teamId === opponent).map(action => action.championId)));
  const ranked = [...observed].map(id => ({ id, ...evidenceFor(history.entries, opponent, id) })).filter(row => row.picks.count + row.bans.count > 0)
    .sort((a, b) => (b.picks.count / (b.picks.eligible || 1) - a.picks.count / (a.picks.eligible || 1)) || (b.bans.count - a.bans.count) || champions[a.id].localeCompare(champions[b.id]));
  const visibleIds = [...new Set([pick, replacement, ...(useSwap ? [primary, backup] : []), ...ranked.map(row => row.id)].filter(Boolean))].slice(0, 4);
  const displayRanks = visibleIds.map(id => ({ id, ...evidenceFor(history.entries, opponent, id) }));
  const evidenceView = overlay?.kind === 'evidence' ? overlay : null;
  const evidence = evidenceView ? evidenceFor(history.entries, opponent, evidenceView.champion) : null;
  const draft = overlay?.kind === 'game' ? overlay : null;
  const fromEvidence = draft?.from;
  const reopenedImpact = reopenedRestricted ? `${champions[pick]} remains restricted` : `${champions[pick]} reopens to both teams`;
  const prepContext = `${ownName} vs ${opponentName} · Game ${target}${isGrid ? ` · ${formatDate.format(new Date(series.startedAt))}` : ' · Fictional series'}`;
  const pickChange = useSwap
    ? `Play ${champions[replacement]} instead of ${champions[pick]} in Game ${target - 1}. ${reopenedImpact}. ${champions[replacement]} locks.`
    : `Keep ${champions[pick]} in Game ${target - 1}. It stays locked for both teams.`;
  const prepBranches = useSwap && primary && backup
    ? `Take ${champions[primary]} if available. If ${opponentName} picks or bans ${champions[primary]}, use ${champions[backup]} if available.`
    : '';
  const prepEvidence = `${opponentName} scouting for ${champions[pick]} (${sampleLabel}). ${scoutingCounts(reserveEvidence)}`;
  const primaryEvidence = useSwap && primary && primary !== pick
    ? `${opponentName} scouting for ${champions[primary]} (${sampleLabel}). ${scoutingCounts(evidenceFor(history.entries, opponent, primary))}`
    : '';
  const prepNote = [prepContext, pickChange, prepBranches, prepEvidence, primaryEvidence].filter(Boolean).join('\n');
  const canCopy = Boolean(checkpoint && pick && (!useSwap || prepBranches));

  function selectDesk(next: Desk) {
    setDesk(next);
    setCopyStatus('');
  }

  function editDesk(changes: Partial<Pick<Desk, 'pick' | 'replacement' | 'plan' | 'primary' | 'backup' | 'disabled'>>) {
    setDesk(current => ({ ...current, ...changes }));
    setCopyStatus('');
  }

  function selectReplacement(id: string) {
    editDesk({ replacement: id, plan: id ? 'swap' : 'recorded', primary: id ? pick : '', backup: '' });
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
      setScoutView('Late series');
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
    setScoutView('Late series');
    setSamePatch(false);
    setImportError('');
  }

  function toggleRestriction(id: string) {
    if (excluded.has(id)) {
      editDesk({ disabled: disabled.filter(item => item !== id) });
      return;
    }
    const nextDisabled = [...disabled, id];
    if (replacement === id) {
      editDesk({ disabled: nextDisabled, replacement: '', plan: 'recorded', primary: '', backup: '' });
    } else {
      editDesk({ disabled: nextDisabled, primary: desk.primary === id ? '' : desk.primary, backup: desk.backup === id ? '' : desk.backup });
    }
  }

  async function copyPrepNote() {
    try {
      await navigator.clipboard.writeText(prepNote);
      setCopyStatus('Prep note copied');
    } catch {
      setCopyStatus('Select the full note below to copy it.');
    }
  }

  function goToComparison() {
    const comparison = document.getElementById('change-pick');
    comparison?.scrollIntoView({ block: 'nearest' });
    const focusTarget = replacementInput.current && !replacementInput.current.disabled ? replacementInput.current : comparison;
    focusTarget?.focus({ preventScroll: true });
  }

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
      <a className="skip-link" href="#draft-desk">Skip to the draft controls</a>
      <header className="masthead nav" id="top">
        <div className="wrap masthead-inner">
          <a className="wordmark" href="#top"><span className="brand-mark" aria-hidden="true"><Clapperboard size={19} strokeWidth={1.8} /></span>Draft Reserve</a>
          <nav aria-label="Workspace">
            <a className="nav-current" href="#draft-desk">Replay</a>
            <a href="#scouting">Scouting</a>
            {checkpoint && <a href="#prep">Prep note</a>}
          </nav>
          <div className="masthead-actions">
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Draft export JSON" onChange={loadFile} />
            <button type="button" className="outline-button" onClick={() => fileInput.current?.click()}><FileUp size={16} aria-hidden="true" /> Import draft file</button>
          </div>
        </div>
      </header>

      <main className="wrap">
        {importError && <p className="import-error" role="alert">{importError} Your current draft stays open.</p>}
        <section className="hero" id="draft-desk" data-enter aria-labelledby="replay-title" tabIndex={-1}>
          <div className="workspace-heading">
            <div className="hero-copy">
              <p className="section-label hero-kicker">League of Legends <b>·</b> Full Fearless</p>
              <ReplayTitle game={target} reducedMotion={reducedMotion} />
              <p className="hero-lede lead">Change a Game {target - 1} pick and see who’s available in Game {target}.</p>
            </div>
            <div className="title-actions actions">
              <button type="button" className="primary-button" onClick={goToComparison}>Compare a pick <ArrowDown size={16} aria-hidden="true" /></button>
              <button className="outline-button" type="button" onClick={() => setOverlay({ kind: 'briefing' })}><Play size={16} aria-hidden="true" /> Watch briefing</button>
            </div>
          </div>
          <div className="data-controls" aria-label="Draft dataset">
            <label className="data-field"><span>Series</span><select value={series.id} onChange={event => selectDesk(chooseDesk(pack, replaySeries.find(item => item.id === event.target.value)))}>
              {replaySeries.map(item => <option key={item.id} value={item.id}>{teams[item.teamIds[0]]} vs {teams[item.teamIds[1]]}{isGrid ? ` · ${formatDate.format(new Date(item.startedAt))}` : ''}</option>)}
            </select></label>
            <label className="data-field"><span>Our team</span><select value={own} onChange={event => selectDesk({ ...chooseDesk(pack, series, event.target.value, target), disabled })}>{series.teamIds.map(id => <option key={id} value={id}>{teams[id]}</option>)}</select></label>
            <label className="data-field"><span>Checkpoint</span><select value={target} onChange={event => selectDesk({ ...chooseDesk(pack, series, own, Number(event.target.value) as Checkpoint), disabled })}>
              {checkpoints.map(number => <option key={number} value={number}>Game {number}</option>)}
            </select></label>
            {isGrid && <button type="button" className="subtle-button demo-button" onClick={useDemo}><RotateCcw size={15} aria-hidden="true" /> Return to demo</button>}
          </div>
          {isGrid && <p className="event-name">{series.event} · {formatDate.format(new Date(series.startedAt))}</p>}
          <div className="desk-grid app-frame">
            <section className="draft-panel" id="change-pick" aria-labelledby="draft-heading" tabIndex={-1}>
              <div className="panel-heading">
                <div><p className="section-label">Game {target - 1} <b>·</b> {ownName}</p><h2 id="draft-heading">Pick comparison</h2></div>
                <button className="subtle-button restrictions-button" type="button" disabled={!restrictions.length} onClick={() => setOverlay({ kind: 'restrictions' })}><ListFilter size={17} aria-hidden="true" /> Restrictions{disabled.length > 0 ? ` (${disabled.length})` : ''}</button>
              </div>

              {checkpoint ? <>
                <div className="scenarios" data-visual>
                  <div className="scenario recorded">
                    <PickArt name={champions[pick]} />
                    <div className="pick-control">
                      <label htmlFor="recorded-pick">Recorded pick</label>
                      <div className="select-wrap">
                        <select id="recorded-pick" value={pick} onChange={event => editDesk({ pick: event.target.value, replacement: '', plan: 'recorded', primary: '', backup: '' })}>
                          {eligiblePicks.map(action => <option value={action.championId} key={action.championId}>{champions[action.championId]}</option>)}
                        </select><ChevronDown size={17} aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                  <span className="swap-arrow" aria-hidden="true"><ArrowLeftRight size={17} /></span>
                  <div className="scenario what-if">
                    <PickArt name={champions[replacement]} />
                    <div className="pick-control">
                      <label htmlFor="replacement">Replacement</label>
                      <div className="select-wrap">
                        <select ref={replacementInput} id="replacement" disabled={!options.length} value={replacement} onChange={event => selectReplacement(event.target.value)}>
                          <option value="">Choose a pick</option>
                          {options.map(id => <option key={id} value={id}>{champions[id]}</option>)}
                        </select><ChevronDown size={17} aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="replay-actions" role="group" aria-label="Swap controls">
                  <button className="outline-button" type="button" disabled={!swap} onClick={() => setReplay(value => value + 1)}><Play size={15} aria-hidden="true" /> Replay swap</button>
                  <button className="subtle-button" type="button" disabled={!replacement} onClick={() => selectReplacement('')}><RotateCcw size={15} aria-hidden="true" /> Reset swap</button>
                </div>
                <div className="impact-heading">
                  <h3 className="section-label">Game {target} pool impact</h3><span>Before standard bans</span>
                </div>
                <div className="impact" aria-live="polite">
                  {swap ? <PoolImpact key={`${pick}-${replacement}-${replay}`} reopened={champions[swap.reopened]} locked={champions[swap.locked]} restricted={reopenedRestricted} reducedMotion={reducedMotion} /> : <p className="empty-impact">{!checkpoint.previous.coverage.bans ? `Game ${target - 1} bans are incomplete. The swap is unavailable.` : !previousPatch ? 'The patch is unknown. The swap is unavailable.' : !options.length ? 'There are no verified alternatives from earlier drafts on this event and patch.' : `Choose a replacement to see the Game ${target} impact.`}</p>}
                </div>
              </> : <p className="empty-impact" role="status">{status.kind === 'ended' ? `Game ${target} was not played. The series ended before this checkpoint.` : status.kind === 'missing' ? `Game ${status.game} picks are missing or incomplete. Game ${target} lockouts cannot be verified.` : 'This series cannot be replayed.'}</p>}
              {checkpoint && <section className="prep" id="prep" aria-labelledby="prep-heading">
                <h3 id="prep-heading">Game {target} prep plan</h3>
                {swap && <fieldset className="plan-choices" aria-label="Plan to copy">
                  <label>
                    <input type="radio" name="prep-plan" checked={!useSwap} onChange={() => editDesk({ plan: 'recorded' })} />
                    <span><strong>Keep {champions[pick]}</strong><small>{champions[pick]} stays locked</small></span>
                  </label>
                  <label>
                    <input type="radio" name="prep-plan" checked={useSwap} onChange={() => editDesk({ plan: 'swap' })} />
                    <span><strong>Use {champions[replacement]}</strong><small>{reopenedImpact}</small></span>
                  </label>
                </fieldset>}
                {useSwap && <div className="plan-picks">
                  <label className="data-field"><span>Primary pick</span><select value={primary} onChange={event => {
                    const next = event.target.value;
                    editDesk({ primary: next, backup: desk.backup === next ? '' : desk.backup });
                  }}>
                    <option value="">Choose a champion</option>{primaryOptions.map(id => <option key={id} value={id}>{champions[id]}</option>)}
                  </select></label>
                  <label className="data-field"><span>Backup</span><select value={backup} disabled={!backupOptions.length} onChange={event => editDesk({ backup: event.target.value })}>
                    <option value="">Choose a champion</option>{backupOptions.map(id => <option key={id} value={id}>{champions[id]}</option>)}
                  </select></label>
                </div>}
                <div className="prep-copy">
                  <p className="prep-matchup">{prepContext}</p>
                  <p>{pickChange}</p>
                  {useSwap && <p>{prepBranches || (primary && !backupOptions.length ? 'No verified backup is available for this pick.' : 'Choose a primary and backup to finish the plan.')}</p>}
                  <p>{prepEvidence}</p>
                  {primaryEvidence && <p>{primaryEvidence}</p>}
                </div>
                <div className="prep-actions">
                  <button className="primary-button" type="button" onClick={copyPrepNote} disabled={!canCopy}>{copyStatus === 'Prep note copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copy prep note</button>
                  <span className="copy-status" role="status">{copyStatus}</span>
                </div>
                {copyStatus && copyStatus !== 'Prep note copied' && <textarea className="note-fallback" aria-label="Full prep note" readOnly value={prepNote} onFocus={event => event.currentTarget.select()} />}
              </section>}
              <div className="series-rail">
                <h3 className="rail-label">Series timeline</h3>
                <div className="rounds" role="group" aria-label="Recorded series drafts">
                  <span className="timeline-playhead" style={{ left: `${(target - 0.5) * 20}%` }} aria-hidden="true" />
                  {[1, 2, 3, 4, 5].map(number => {
                    const game = series.games.find(entry => entry.number === number);
                    const label = <><span className="round-number" aria-hidden="true">Game {number}</span><span className="round-state">{number === target ? 'Target' : game?.winnerId ? teams[game.winnerId] : game ? 'Draft recorded' : 'No draft'}</span></>;
                    if (number === target) return <a key={number} className="round current-round" href="#change-pick" aria-current="step" aria-label={`Game ${number} checkpoint`}>{label}</a>;
                    return <button key={number} type="button" className="round" disabled={!game} aria-label={`View Game ${number} draft${game?.winnerId ? `, ${teams[game.winnerId]} won` : ''}`} onClick={() => game && setOverlay({ kind: 'game', series, game })}>{label}</button>;
                  })}
                </div>
              </div>
            </section>
            <aside className="inspector" aria-label="Series score and scouting">
              <div className="match-sheet" role="group" aria-label={`Score entering Game ${target}`}>
                <div className="match-cover">
                  <figure className="match-background" data-moment="liquid-hover" data-moment-opts='{"strength":0.35}' aria-hidden="true">
                    <img src={`${staticMedia}azir-splash.jpg`} alt="" width={1215} height={717} fetchPriority="high" />
                  </figure>
                  <div className="match-meta">
                    <span className="source-label"><i aria-hidden="true" />{isGrid ? 'Local GRID data' : 'Fictional series'}</span>
                    <span><abbr title="Best of five">Bo5</abbr>{previousPatch && ` · Patch ${previousPatch}`}</span>
                  </div>
                </div>
                <div className="scoreboard">
                  <div className="score-team">
                    <span className="team-mark" aria-hidden="true">{teams[series.teamIds[0]][0]}</span>
                    <span>{teams[series.teamIds[0]]}</span>
                  </div>
                  <div className="score-center">
                    <strong>{scoreComplete ? scores[0] : '—'}<span>–</span>{scoreComplete ? scores[1] : '—'}</strong>
                    <span>Before Game {target}</span>
                  </div>
                  <div className="score-team score-second">
                    <span className="team-mark" aria-hidden="true">{teams[series.teamIds[1]][0]}</span>
                    <span>{teams[series.teamIds[1]]}</span>
                  </div>
                </div>
                <div className="match-foot">
                  <LockKeyhole size={13} aria-hidden="true" /> {checkpoint ? `${checkpoint.locks.size} picks locked` : 'Lockouts unavailable'}
                </div>
              </div>
              <section className="scout-panel" id="scouting" aria-labelledby="scout-heading">
                <div className="panel-heading scout-heading">
                  <div><p className="section-label">Opponent scouting</p><h2 id="scout-heading">{opponentName}</h2></div>
                </div>
                <div className="scout-filters">
                  <div className="segmented" role="group" aria-label="Scouting sample">
                    {(['Late series', 'Target game', 'All games'] as const).map(option => <button type="button" key={option} aria-pressed={scoutView === option} onClick={() => { setScoutView(option); setCopyStatus(''); }}>{option === 'Target game' ? `Game ${target}` : option}</button>)}
                  </div>
                  <label className="patch-filter" title={previousPatch ? `Patch ${previousPatch}` : undefined}><input type="checkbox" checked={Boolean(previousPatch) && samePatch} disabled={!previousPatch} onChange={event => { setSamePatch(event.target.checked); setCopyStatus(''); }} /> Same patch</label>
                </div>
                <div className="stats-heading section-label"><span>{scope}</span><span>Picked</span><span>Banned</span></div>
                {history.entries.length ? <ul className="stats-list">
                  {displayRanks.map(({ id, picks, bans }) => <li key={id} className={id === pick ? 'reserve-stat' : ''}>
                    <button type="button" aria-label={`${champions[id]}, ${picks.eligible ? `${picks.count} picks in ${picks.eligible} eligible drafts` : 'no eligible pick drafts'}, ${bans.eligible ? `${bans.count} bans in ${bans.eligible} eligible drafts` : 'no eligible ban drafts'}. View evidence`} onClick={() => setOverlay({ kind: 'evidence', champion: id })}>
                      <ChampionPortrait name={champions[id]} small />
                      <span className="stats-name">{champions[id]}{Math.min(picks.eligible, bans.eligible) < 5 && <small>Sparse</small>}
                        <span className="stat-track" aria-hidden="true"><m.span initial={false} animate={{ scaleX: picks.eligible ? picks.count / picks.eligible : 0 }} transition={{ duration: reducedMotion ? 0 : 0.28 }} /></span>
                      </span>
                      <strong><EvidenceCount {...picks} /></strong><strong><EvidenceCount {...bans} /></strong><ArrowUpRight size={15} className="stat-chevron" aria-hidden="true" />
                    </button>
                  </li>)}
                </ul> : <p className="empty-impact">{scoutView === 'Target game' ? `No covered earlier Game ${target} drafts${patchFilter ? ' on this patch' : ''}.` : 'No covered earlier drafts match this filter.'}</p>}
                <p className="sample-note">{history.entries.length} covered {history.entries.length === 1 ? 'game' : 'games'}{dates.length > 0 && ` · ${formatDate.formatRange(new Date(Math.min(...dates)), new Date(Math.max(...dates)))}`}{history.excluded > 0 && ` · ${history.excluded} excluded for coverage`}. A dash means no eligible drafts.</p>
                {scoutView === 'Late series' && history.entries.length > 0 && <p className="sample-breakdown">{checkpoints.map(number => `Game ${number} (${history.entries.filter(({ game }) => game.number === number).length})`).join(' · ')}</p>}
              </section>
            </aside>
          </div>
        </section>

      </main>
      <footer className="wrap">
        <p>Champion images from <a href="https://developer.riotgames.com/docs/lol#data-dragon">Riot Data Dragon</a>. Match data provided by GRID when a local export is loaded.</p>
        <p>Draft Reserve is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.</p>
      </footer>
      {overlay?.kind === 'briefing' && <Dialog title="Game 5 briefing" close={() => setOverlay(null)}>
        <video className="briefing-video" controls autoPlay={!reducedMotion} muted playsInline poster={`${staticMedia}river-crossing.webp`} preload={reducedMotion ? 'metadata' : 'auto'} aria-label="Animated Game 5 briefing">
          <source src={`${staticMedia}briefing.webm`} type="video/webm" />
          <source src={`${staticMedia}briefing.mp4`} type="video/mp4" />
        </video>
        <p className="dialog-note">Champions picked earlier in a Fearless series lock for both teams. Replace one Game 4 pick to see who returns to the Game 5 pool.</p>
      </Dialog>}
      {(draft || evidenceView) && <Dialog
        title={draft ? `Game ${draft.game.number} draft` : `${champions[evidenceView!.champion]} scouting evidence`}
        close={() => setOverlay(null)}
        back={fromEvidence ? () => setOverlay(fromEvidence) : undefined}
      >
        {draft ? <>
          <p className="dialog-note">{draft.series.teamIds.map(id => teams[id]).join(' vs ')} · {formatDate.format(new Date(draft.series.startedAt))}{draft.game.patch && ` · Patch ${draft.game.patch}`}</p>
          <p className="dialog-note">{draft.game.winnerId ? `${teams[draft.game.winnerId]} won.` : 'The winner is unknown.'} {draft.game.coverage.picks ? 'Both teams carry these picks forward as lockouts.' : 'The feed has incomplete picks.'} {!draft.game.coverage.bans && 'The feed has incomplete bans.'}</p>
          {draft.game.actions.length > 0 && <ol className="game-actions" aria-label="Recorded draft order">
            {draft.game.actions.map((action, index) => <li key={`${action.championId}-${index}`}>
              <span className="draft-order" aria-hidden="true">{index + 1}</span>
              <ChampionPortrait name={champions[action.championId]} small />
              <span><strong>{champions[action.championId]}</strong><small>{teams[action.teamId]}</small></span>
              <span>{action.kind === 'pick' ? 'Pick' : 'Ban'}</span>
            </li>)}
          </ol>}
        </> : evidenceView && evidence && <>
          <p className="dialog-note">{opponentName} · {sampleLabel} · Earlier covered drafts</p>
          {!evidence.rows.length && <p className="dialog-note">No eligible drafts for {champions[evidenceView.champion]} in this sample.</p>}
          {evidence.samples.length > 0 && <ul className="evidence-list source-drafts">{evidence.samples.map(row => <li key={`${row.series.id}-${row.game.id}`}>
            <button type="button" className="evidence-draft" onClick={() => setOverlay({ kind: 'game', series: row.series, game: row.game, from: evidenceView })}>
              <span><strong>{teams[row.series.teamIds.find(id => id !== opponent)!]} · Game {row.game.number}</strong><small>{formatDate.format(new Date(row.series.startedAt))}</small></span>
              <span>{row.locked ? 'Fearless-locked' : row.picked ? 'Picked' : row.banned ? 'Banned' : row.picked === null || row.banned === null ? 'Partial coverage' : 'Passed'}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </li>)}</ul>}
        </>}
      </Dialog>}
      {overlay?.kind === 'restrictions' && <Dialog title="Tournament restrictions" close={() => setOverlay(null)}>
        <p className="dialog-note">Exclude champions disabled for this series. Draft Reserve uses observed picks and bans as evidence for the patch and event.</p>
        <ul className="evidence-list restrictions-list">
          {restrictions.map(id => <li key={id}>
            <label>
              <input type="checkbox" checked={disabled.includes(id)} onChange={() => toggleRestriction(id)} />
              <ChampionPortrait name={champions[id]} small />
              <span>{champions[id]}</span>
            </label>
          </li>)}
        </ul>
      </Dialog>}
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <LazyMotion features={domAnimation} strict><App /></LazyMotion>
);
