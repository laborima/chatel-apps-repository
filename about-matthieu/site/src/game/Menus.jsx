import React, { useState } from 'react';
import { CRAFTS, SEA_STATES, KNOT } from './physics';
import { MODES, CHALLENGES, fmtTime } from './session';

const bestOf = (save, mode, craft) => {
    const v = save.best[`${mode}:${craft}`];
    if (v === undefined) return '—';
    return mode === 'slalom' ? fmtTime(v) : `${v.toLocaleString('fr-FR')} pts`;
};

/** Challenges list with progress. */
export const Challenges = ({ save, highlight = [] }) => {
    const done = CHALLENGES.filter((c) => save.done[c.id]).length;
    return (
        <div className="challenges">
            <div className="ch-head"><b>Défis</b><span>{done} / {CHALLENGES.length}</span></div>
            <div className="ch-bar"><i style={{ width: `${(100 * done) / CHALLENGES.length}%` }} /></div>
            <ul>
                {CHALLENGES.map((c) => (
                    <li key={c.id} className={`${save.done[c.id] ? 'ok' : ''} ${highlight.includes(c.id) ? 'new' : ''}`}>
                        <span aria-hidden="true">{save.done[c.id] ? '✓' : '○'}</span> {c.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};

/** Start screen: mode, sport, sea and wind, records, challenges. */
export const MainMenu = ({ mode, setMode, craft, onCraft, ready, wind, sea, onSettings, save, sharksOn, onSharks, onStart, onDemo, onExit, muted, onMute }) => {
    const [showCh, setShowCh] = useState(false);
    return (
        <div className="overlay menu" role="dialog" aria-label="Menu du jeu">
            <div className="menu-card">
                <p className="eyebrow">Ocearo · planche à voile & wing foil</p>
                <h1 className="menu-title">Ride</h1>
                <div className="modes" role="radiogroup" aria-label="Mode de jeu">
                    {Object.entries(MODES).map(([k, m]) => (
                        <button key={k} role="radio" aria-checked={mode === k} className={`mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
                            <b>{m.label}</b><span>{m.blurb}</span>
                            {k !== 'ride' ? <em>Record : {bestOf(save, k, craft)}</em> : <em>Vitesse max : {save.best[`speed:${craft}`] ? `${(save.best[`speed:${craft}`] / KNOT).toFixed(1)} nœuds` : '—'}</em>}
                        </button>
                    ))}
                </div>
                <div className="menu-row">
                    <div className="seas" role="radiogroup" aria-label="Sport">
                        {Object.entries(CRAFTS).map(([k, v]) => (
                            <button key={k} role="radio" aria-checked={craft === k} className={craft === k ? 'on' : ''} disabled={!ready[k]} onClick={() => onCraft(k)}>
                                {v.label}{ready[k] ? '' : ' (chargement…)'}
                            </button>
                        ))}
                    </div>
                    <div className="seas" role="radiogroup" aria-label="État de la mer">
                        {Object.entries(SEA_STATES).map(([k, v]) => (
                            <button key={k} role="radio" aria-checked={sea === k} className={sea === k ? 'on' : ''} onClick={() => onSettings({ wind, sea: k })}>{v.label}</button>
                        ))}
                    </div>
                    <label className="wind-row">Vent <b>{wind} nœuds</b>
                        <input type="range" min="8" max="35" step="1" value={wind} onChange={(e) => onSettings({ wind: Number(e.target.value), sea })} />
                    </label>
                </div>
                <div className="menu-actions">
                    <button className="play" onClick={onStart} autoFocus>C'est parti</button>
                    <button className="ghost-btn demo-btn" onClick={onDemo}>▶ Démo : toutes les figures</button>
                    <button className="ghost-btn" onClick={() => setShowCh((v) => !v)} aria-expanded={showCh}>
                        Défis {CHALLENGES.filter((c) => save.done[c.id]).length}/{CHALLENGES.length}
                    </button>
                    <button className="ghost-btn" onClick={onMute} aria-pressed={!muted}>{muted ? 'Son coupé' : 'Son activé'}</button>
                    <button className="ghost-btn" onClick={onSharks} aria-pressed={sharksOn} title="En freestyle et en balade">{sharksOn ? 'Requins de Tintin : oui' : 'Requins de Tintin : non'}</button>
                    {onExit ? <button className="ghost-btn" onClick={onExit}>← Retour à la fiche</button> : null}
                </div>
                {showCh ? <Challenges save={save} /> : null}
                <p className="menu-keys">Entrée ou Options (manette) pour démarrer · Échap pour revenir au menu</p>
            </div>
        </div>
    );
};

/** End of a freestyle session or a slalom run. */
export const EndScreen = ({ sess, craft, save, onAgain, onMenu }) => {
    const slalom = sess.mode === 'slalom';
    return (
        <div className="overlay end" role="dialog" aria-label="Résultat">
            <div className="menu-card">
                <p className="eyebrow">{MODES[sess.mode].label} · {CRAFTS[craft].label}</p>
                <h2 className="end-title">{slalom ? (sess.finished ? 'Arrivée !' : 'Parcours abandonné') : 'Temps écoulé !'}</h2>
                <p className="end-score">{slalom ? fmtTime(sess.time) : `${sess.score.toLocaleString('fr-FR')} pts`}</p>
                {sess.record ? <p className="record">Nouveau record !</p>
                    : sess.prevBest !== null ? <p className="end-best">Record : {slalom ? fmtTime(sess.prevBest) : `${sess.prevBest.toLocaleString('fr-FR')} pts`}</p> : null}
                <ul className="end-stats">
                    <li><b>{(sess.maxSpeed / KNOT).toFixed(1)}</b> nœuds max</li>
                    <li><b>{sess.maxJump.toFixed(1)} m</b> plus haut saut</li>
                    <li><b>{sess.tricks}</b> figures</li>
                    {slalom && sess.splits.length ? <li><b>{sess.splits.map((t) => fmtTime(t)).join(' · ')}</b> passages</li> : null}
                </ul>
                {sess.newDone.length ? <Challenges save={save} highlight={sess.newDone} /> : null}
                <div className="menu-actions">
                    <button className="play" onClick={onAgain} autoFocus>Rejouer</button>
                    <button className="ghost-btn" onClick={onMenu}>Menu</button>
                </div>
            </div>
        </div>
    );
};
