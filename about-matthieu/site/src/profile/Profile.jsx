import React, { lazy, Suspense, useEffect, useState } from 'react';
import showcase from '../data/showcase.json';
import highlights from '../data/highlights.json';
import './profile.css';

// the live 3D sea (three.js + the rider model) loads after the page is on screen
const HeroScene = lazy(() => import('./HeroScene'));

const IMG = `${import.meta.env.BASE_URL}img/photos/`;
const PROJ = `${import.meta.env.BASE_URL}img/projects/`;
const USER = { name: 'Matthieu Laborie', login: 'laborima', url: 'https://github.com/laborima' };
const PHOTOS = [      // 4 portraits + 1 landscape spanning two columns: two full rows of three
    { src: 'planche-1.webp', alt: 'Matthieu en planche à voile, au planing, voile bordée' },
    { src: 'planche-2.webp', alt: 'Matthieu au planing dans le clapot' },
    { src: 'planche-3.webp', alt: 'Matthieu accroché au harnais, pieds dans les straps' },
    { src: 'planche-5.webp', alt: 'Matthieu à l\'empannage, la voile qui bascule', wide: true },
    { src: 'planche-4.webp', alt: 'Matthieu en planche à voile, gerbe sous la planche' },
];

/** Full-screen photo viewer: arrows / swipe-free buttons, Escape or a click outside closes it. */
const Lightbox = ({ i, onClose, onGo }) => {
    useEffect(() => {
        const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onGo(1); if (e.key === 'ArrowLeft') onGo(-1); };
        window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    }, [onClose, onGo]);
    const p = PHOTOS[i];
    return (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={p.alt} onClick={onClose}>
            <img src={IMG + p.src} alt={p.alt} onClick={(e) => e.stopPropagation()} />
            <button className="lb-btn lb-prev" aria-label="Photo précédente" onClick={(e) => { e.stopPropagation(); onGo(-1); }}>‹</button>
            <button className="lb-btn lb-next" aria-label="Photo suivante" onClick={(e) => { e.stopPropagation(); onGo(1); }}>›</button>
            <button className="lb-btn lb-close" aria-label="Fermer" onClick={onClose}>×</button>
        </div>
    );
};
const Icon = {
    github: <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>,
    play: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z" /></svg>,
    arrow: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M7 17 17 7M9 7h8v8" /></svg>,
};

export default function Profile({ onPlay }) {
    const user = USER;
    const [scrolled, setScrolled] = useState(false);
    const [hero3d, setHero3d] = useState(false);
    const [photo, setPhoto] = useState(null);
    useEffect(() => {
        const f = () => setScrolled(window.scrollY > 24); f();
        window.addEventListener('scroll', f, { passive: true });
        // start the 3D after the first paint; skip it on very small or data-saving devices
        const slow = navigator.connection?.saveData;
        const t = !slow && setTimeout(() => setHero3d(true), 250);
        return () => { window.removeEventListener('scroll', f); clearTimeout(t); };
    }, []);
    return (
        <div className="about">
            <a className="skip" href="#projets">Aller au contenu</a>
            <nav className={`about-nav ${scrolled ? 'scrolled' : ''}`} aria-label="Navigation">
                <div className="wrap">
                    <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                        <span className="brand-mark" aria-hidden="true" />Matthieu Laborie
                    </a>
                    <ul className="nav-links">
                        <li><a href="#mer">Sur l'eau</a></li>
                        <li><a href="#projets">Projets</a></li>
                        <li><a href="#ride">Ride</a></li>
                    </ul>
                    <div className="nav-end">
                        <a className="icon-btn" href={user.url} target="_blank" rel="noreferrer" aria-label="GitHub">{Icon.github}</a>
                        <button className="btn btn-primary btn-s" onClick={onPlay}>{Icon.play}Jouer</button>
                    </div>
                </div>
            </nav>

            <header className="about-hero" id="top">
                {hero3d ? <Suspense fallback={null}><HeroScene /></Suspense> : null}
                <div className="hero-shade" aria-hidden="true" />
                <div className="wrap hero-copy">
                    <p className="eyebrow">À propos de l'auteur</p>
                    <h1><span className="grad">{user.name}</span></h1>
                    <p className="lead">{highlights.tagline}</p>
                    <ul className="chips">
                        {highlights.facts.map((f) => <li key={f} className="chip"><i />{f}</li>)}
                    </ul>
                    <div className="cta">
                        <button className="btn btn-primary" onClick={onPlay}>{Icon.play}Jouer à Ride</button>
                        <a className="btn btn-ghost" href={user.url} target="_blank" rel="noreferrer">{Icon.github}GitHub · {user.login}</a>
                    </div>
                </div>
                <p className="hero-caption">En direct : mon avatar sur la mer d'Ocearo, au crépuscule</p>
            </header>


            <section className="section water" id="mer">
                <div className="wrap water-grid">
                    <figure className="portrait">
                        <img src={IMG + 'barre.webp'} alt="Matthieu à la barre d'un voilier, en ciré, gilet et longe" loading="lazy" />
                        <figcaption><span>À la barre</span></figcaption>
                    </figure>
                    <div className="water-copy">
                        <div className="section-head">
                            <p className="eyebrow">Sur l'eau</p>
                            <h2>La mer d'abord</h2>
                            <p className="lead">À la barre d'un voilier ou sur ma planche à voile, c'est sur l'eau que naissent mes projets : Ocearo vient de là.</p>
                        </div>
                        <div className="gallery">
                            {PHOTOS.map((p, i) => (
                                <button key={p.src} className={`shot ${p.wide ? 'wide' : ''}`} onClick={() => setPhoto(i)} aria-label={`Agrandir : ${p.alt}`}>
                                    <img src={IMG + p.src} alt={p.alt} loading="lazy" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
            {photo !== null ? <Lightbox i={photo} onClose={() => setPhoto(null)} onGo={(d) => setPhoto((photo + d + PHOTOS.length) % PHOTOS.length)} /> : null}

            <section className="section" id="projets">
                <div className="wrap">
                    <div className="section-head">
                        <p className="eyebrow">Projets</p>
                        <h2>Ce que je construis</h2>
                        <p className="lead">Sur mon temps libre, entre la mer, l'électronique et le code.</p>
                    </div>
                    <div className="projects">
                        {showcase.projects.map((p, i) => (
                            <article key={p.id} className={`project ${i % 2 ? 'flip' : ''}`}>
                                <div className={`project-img ${p.contain ? 'contain' : ''}`}><img src={PROJ + p.image} alt={p.alt} loading="lazy" /></div>
                                <div className="project-copy">
                                    <p className="eyebrow">{p.kicker}</p>
                                    <h3>{p.name}</h3>
                                    <p>{p.text}</p>
                                    {p.links.length ? (
                                        <div className="project-links">
                                            {p.links.map((l) => <a key={l.url} className="btn btn-ghost btn-s" href={l.url} target="_blank" rel="noreferrer">{l.label}{Icon.arrow}</a>)}
                                        </div>
                                    ) : null}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="section ride" id="ride">
                <div className="wrap feature">
                    <div className="feature-copy">
                        <p className="eyebrow">Le jeu</p>
                        <h2>Ride, sur la mer d'Ocearo</h2>
                        <p className="lead">Planche à voile et wing foil, avec mon avatar. Les vagues et le ciel viennent d'Ocearo UI.</p>
                        <ul className="ticks">
                            <li><span><b>Freestyle, slalom, balade</b> : combos, chrono, 20 défis et records.</span></li>
                            <li><span><b>Les vraies figures</b> : forward, back et push loops, table-top, Vulcan, Spock, Flaka, duck jibe, hélitack.</span></li>
                            <li><span><b>Les vagues pour tremplin</b>, le planing, le vol en foil, les gerbes et le son.</span></li>
                            <li><span><b>Clavier, tactile ou manette PlayStation</b>, et une démo qui enchaîne tout.</span></li>
                        </ul>
                        <div className="cta left"><button className="btn btn-primary" onClick={onPlay}>{Icon.play}Jouer maintenant</button></div>
                    </div>
                    <button className="media" onClick={onPlay} aria-label="Jouer à Ride">
                        <img src={`${import.meta.env.BASE_URL}img/windsurfer.webp`} alt="Le jeu Ride : le planchiste sur la mer d'Ocearo" loading="lazy" />
                        <span className="media-play">{Icon.play}</span>
                        <span className="tag">JP Australia Magic Ride 119 · Duotone E_Pace 6.2</span>
                    </button>
                </div>
            </section>

            <section className="section workshop" id="atelier">
                <div className="wrap">
                    <p className="eyebrow">Dans l'atelier</p>
                    <p className="workshop-line">Bientôt ici : {showcase.workshop.map((w, i) => <React.Fragment key={w}>{i ? (i === showcase.workshop.length - 1 ? ' et ' : ', ') : ''}<b>{w}</b></React.Fragment>)}.</p>
                </div>
            </section>

            <footer className="about-foot">
                <div className="wrap">
                    <span>© {new Date().getFullYear()} {user.name}</span>
                    <span>Mer, ciel et vagues : <a href="https://github.com/laborima/ocearo-ui" target="_blank" rel="noreferrer">Ocearo UI</a> · Polices Geist</span>
                </div>
            </footer>
        </div>
    );
}
