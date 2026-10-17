import React, { useState } from 'react';
import { CRAFTS, SEA_STATES, KNOT } from './physics';
import { MODES, CHALLENGES, fmtTime } from './session';
import { tr, useLang, getLang, setLang } from '../i18n';

const num = (n) => n.toLocaleString(getLang() === 'en' ? 'en-GB' : 'fr-FR');

const bestOf = (save, mode, craft) => {
    const v = save.best[`${mode}:${craft}`];
    if (v === undefined) return '—';
    return mode === 'slalom' ? fmtTime(v) : `${num(v)} pts`;
};

/** Challenges list with progress. */
export const Challenges = ({ save, highlight = [] }) => {
    const done = CHALLENGES.filter((c) => save.done[c.id]).length;
    return (
        <div className="challenges">
            <div className="ch-head"><b>{tr('Défis', 'Challenges')}</b><span>{done} / {CHALLENGES.length}</span></div>
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
    const [showCh, setShowCh] = useState(false); const [lang] = useLang();
    return (
        <div className="overlay menu" role="dialog" aria-label={tr('Menu du jeu', 'Game menu')}>
            <div className="menu-card">
                <p className="eyebrow">{tr('Ocearo · planche à voile & wing foil', 'Ocearo · windsurfing & wing foiling')}</p>
                <h1 className="menu-title">Ride</h1>
                <div className="modes" role="radiogroup" aria-label={tr('Mode de jeu', 'Game mode')}>
                    {Object.entries(MODES).map(([k, m]) => (
                        <button key={k} role="radio" aria-checked={mode === k} className={`mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>
                            <b>{m.label}</b><span>{m.blurb}</span>
                            {k !== 'ride' ? <em>{tr('Record : ', 'Best: ')}{bestOf(save, k, craft)}</em> : <em>{tr('Vitesse max : ', 'Top speed: ')}{save.best[`speed:${craft}`] ? `${(save.best[`speed:${craft}`] / KNOT).toFixed(1)} ${tr('nœuds', 'knots')}` : '—'}</em>}
                        </button>
                    ))}
                </div>
                <div className="menu-row">
                    <div className="seas" role="radiogroup" aria-label={tr('Sport', 'Sport')}>
                        {Object.entries(CRAFTS).map(([k, v]) => (
                            <button key={k} role="radio" aria-checked={craft === k} className={craft === k ? 'on' : ''} disabled={!ready[k]} onClick={() => onCraft(k)}>
                                {v.label}{ready[k] ? '' : tr(' (chargement…)', ' (loading…)')}
                            </button>
                        ))}
                    </div>
                    <div className="seas" role="radiogroup" aria-label={tr('État de la mer', 'Sea state')}>
                        {Object.entries(SEA_STATES).map(([k, v]) => (
                            <button key={k} role="radio" aria-checked={sea === k} className={sea === k ? 'on' : ''} onClick={() => onSettings({ wind, sea: k })}>{v.label}</button>
                        ))}
                    </div>
                    <label className="wind-row">{tr('Vent', 'Wind')} <b>{wind} {tr('nœuds', 'knots')}</b>
                        <input type="range" min="8" max="35" step="1" value={wind} onChange={(e) => onSettings({ wind: Number(e.target.value), sea })} />
                    </label>
                </div>
                <div className="menu-actions">
                    <button className="play" onClick={onStart} autoFocus>{tr('C\'est parti', 'Let\'s go')}</button>
                    <button className="ghost-btn demo-btn" onClick={onDemo}>{tr('▶ Démo : toutes les figures', '▶ Demo: every move')}</button>
                    <button className="ghost-btn" onClick={() => setShowCh((v) => !v)} aria-expanded={showCh}>
                        {tr('Défis', 'Challenges')} {CHALLENGES.filter((c) => save.done[c.id]).length}/{CHALLENGES.length}
                    </button>
                    <button className="ghost-btn" onClick={onMute} aria-pressed={!muted}>{muted ? tr('Son coupé', 'Sound off') : tr('Son activé', 'Sound on')}</button>
                    <button className="ghost-btn" onClick={onSharks} aria-pressed={sharksOn} title={tr('En freestyle et en balade', 'In freestyle and cruise')}>{sharksOn ? tr('Requins de Tintin : oui', 'Tintin sharks: on') : tr('Requins de Tintin : non', 'Tintin sharks: off')}</button>
                    <button className="ghost-btn" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} lang={lang === 'fr' ? 'en' : 'fr'}>{lang === 'fr' ? 'English' : 'Français'}</button>
                    {onExit ? <button className="ghost-btn" onClick={onExit}>{tr('← Retour à la fiche', '← Back to the page')}</button> : null}
                </div>
                {showCh ? <Challenges save={save} /> : null}
                <p className="menu-keys">{tr('Entrée ou Options (manette) pour démarrer · Échap pour revenir au menu', 'Enter or Options (controller) to start · Escape for the menu')}</p>
            </div>
        </div>
    );
};

/** End of a freestyle session or a slalom run. */
export const EndScreen = ({ sess, craft, save, onAgain, onMenu }) => {
    useLang();
    const slalom = sess.mode === 'slalom';
    return (
        <div className="overlay end" role="dialog" aria-label={tr('Résultat', 'Result')}>
            <div className="menu-card">
                <p className="eyebrow">{MODES[sess.mode].label} · {CRAFTS[craft].label}</p>
                <h2 className="end-title">{slalom ? (sess.finished ? tr('Arrivée !', 'Finished!') : tr('Parcours abandonné', 'Course abandoned')) : tr('Temps écoulé !', 'Time\'s up!')}</h2>
                <p className="end-score">{slalom ? fmtTime(sess.time) : `${num(sess.score)} pts`}</p>
                {sess.record ? <p className="record">{tr('Nouveau record !', 'New record!')}</p>
                    : sess.prevBest !== null ? <p className="end-best">{tr('Record : ', 'Best: ')}{slalom ? fmtTime(sess.prevBest) : `${num(sess.prevBest)} pts`}</p> : null}
                <ul className="end-stats">
                    <li><b>{(sess.maxSpeed / KNOT).toFixed(1)}</b> {tr('nœuds max', 'knots top speed')}</li>
                    <li><b>{sess.maxJump.toFixed(1)} m</b> {tr('plus haut saut', 'highest jump')}</li>
                    <li><b>{sess.tricks}</b> {tr('figures', 'moves')}</li>
                    {slalom && sess.splits.length ? <li><b>{sess.splits.map((t) => fmtTime(t)).join(' · ')}</b> {tr('passages', 'splits')}</li> : null}
                </ul>
                {sess.newDone.length ? <Challenges save={save} highlight={sess.newDone} /> : null}
                <div className="menu-actions">
                    <button className="play" onClick={onAgain} autoFocus>{tr('Rejouer', 'Play again')}</button>
                    <button className="ghost-btn" onClick={onMenu}>Menu</button>
                </div>
            </div>
        </div>
    );
};
