import React, { lazy, Suspense, useEffect, useState } from 'react';
import showcase from '../data/showcase.json';
import highlights from '../data/highlights.json';
import './profile.css';
import { useLang, tr, field, LANGS, LANG_NAMES } from '../i18n';

// the live 3D sea (three.js + the rider model) loads after the page is on screen
const HeroScene = lazy(() => import('./HeroScene'));

const IMG = `${import.meta.env.BASE_URL}img/photos/`;
const PROJ = `${import.meta.env.BASE_URL}img/projects/`;
const USER = { name: 'Matthieu Laborie', login: 'laborima', url: 'https://github.com/laborima', mail: 'ocearo@leslaborie.org' };
const PHOTOS = [      // 4 portraits + 1 landscape spanning two columns: two full rows of three
    { src: 'planche-1.webp', alt: 'Matthieu en planche à voile, au planing, voile bordée', alt_en: 'Matthieu windsurfing, planing, sail sheeted in', alt_pt: 'Matthieu no windsurf, planando, vela caçada' },
    { src: 'plongee.webp', alt: 'Matthieu en combinaison de plongée, de retour sur le bateau, masque autour du cou', alt_en: 'Matthieu in a diving suit, back on the boat, mask round his neck', alt_pt: 'Matthieu de roupa de mergulho, de volta ao barco, máscara no pescoço' },
    { src: 'planche-3.webp', alt: 'Matthieu accroché au harnais, pieds dans les straps', alt_en: 'Matthieu hooked in, feet in the straps', alt_pt: 'Matthieu enganchado no trapézio, pés nas alças' },
    { src: 'planche-saut.webp', alt: 'Matthieu en saut devant la plage, la planche à la verticale', alt_en: 'Matthieu jumping off the beach, the board upright', alt_pt: 'Matthieu saltando em frente à praia, a prancha na vertical', wide: true },
    { src: 'combi.webp', alt: 'Matthieu en combinaison et harnais, de retour sur la plage', alt_en: 'Matthieu in wetsuit and harness, back on the beach', alt_pt: 'Matthieu de roupa de neoprene e trapézio, de volta à praia' },
];

/** Full-screen photo viewer: arrows / swipe-free buttons, Escape or a click outside closes it. */
const Lightbox = ({ i, list, onClose, onGo }) => {
    useEffect(() => {
        const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') onGo(1); if (e.key === 'ArrowLeft') onGo(-1); };
        window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
    }, [onClose, onGo]);
    const p = list[i]; const many = list.length > 1;
    return (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={p.alt} onClick={onClose}>
            <img src={p.url} alt={p.alt} onClick={(e) => e.stopPropagation()} />
            {many ? <button className="lb-btn lb-prev" aria-label={tr('Photo précédente', 'Previous photo', 'Foto anterior')} onClick={(e) => { e.stopPropagation(); onGo(-1); }}>‹</button> : null}
            {many ? <button className="lb-btn lb-next" aria-label={tr('Photo suivante', 'Next photo', 'Próxima foto')} onClick={(e) => { e.stopPropagation(); onGo(1); }}>›</button> : null}
            <button className="lb-btn lb-close" aria-label={tr('Fermer', 'Close', 'Fechar')} onClick={onClose}>×</button>
        </div>
    );
};
const Icon = {
    github: <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>,
    play: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z" /></svg>,
    linkedin: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4v-11Z" /></svg>,
    mail: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M3.5 6.5h17v11h-17zM4 7l8 6 8-6" /></svg>,
    arrow: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M7 17 17 7M9 7h8v8" /></svg>,
};

/** Page title and description follow the language (the static ones in index.html are French). */
const META = {
    fr: ['Matthieu Laborie — auteur d\'Ocearo, voile et planche à voile', 'Matthieu Laborie, auteur d\'Ocearo. Projets open source autour de la mer : logiciel de navigation, électronique, et un jeu de planche à voile.'],
    pt: ['Matthieu Laborie — autor do Ocearo, vela e windsurf', 'Matthieu Laborie, autor do Ocearo. Projetos de código aberto em torno do mar: software de navegação, eletrônica e um jogo de windsurf.'],
    en: ['Matthieu Laborie — author of Ocearo, sailing and windsurfing', 'Matthieu Laborie, author of Ocearo. Open-source projects around the sea: navigation software, electronics, and a windsurfing game.'],
};

export default function Profile({ onPlay }) {
    const user = USER;
    const [lang, setLang] = useLang();
    useEffect(() => {
        const [title, desc] = META[lang]; document.title = title;
        document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    }, [lang]);
    const [scrolled, setScrolled] = useState(false);
    const [hero3d, setHero3d] = useState(false);
    const [photo, setPhoto] = useState(null);           // { list: [{ url, alt }], i }
    const gallery = PHOTOS.map((p) => ({ url: IMG + p.src, alt: field(p, 'alt') }));
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
            <a className="skip" href="#projets">{tr('Aller au contenu', 'Skip to content', 'Ir para o conteúdo')}</a>
            <nav className={`about-nav ${scrolled ? 'scrolled' : ''}`} aria-label="Navigation">
                <div className="wrap">
                    <a className="brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                        <span className="brand-mark" aria-hidden="true" />Matthieu Laborie
                    </a>
                    <ul className="nav-links">
                        <li><a href="#mer">{tr('Sur l\'eau', 'On the water', 'Na água')}</a></li>
                        <li><a href="#projets">{tr('Projets', 'Projects', 'Projetos')}</a></li>
                        <li><a href="#ride">Ride</a></li>
                    </ul>
                    <div className="nav-end">
                        {showcase.linkedin ? <a className="icon-btn in" href={showcase.linkedin} target="_blank" rel="noreferrer" aria-label={tr('Parcours pro sur LinkedIn', 'Career on LinkedIn', 'Carreira no LinkedIn')}>{Icon.linkedin}</a> : null}
                        <a className="icon-btn" href={user.url} target="_blank" rel="noreferrer" aria-label="GitHub">{Icon.github}</a>
                        <label className="lang-pick">
                            <span className="sr-only">{tr('Langue', 'Language', 'Idioma')}</span>
                            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={tr('Langue', 'Language', 'Idioma')}>
                                {LANGS.map((l) => <option key={l} value={l} lang={l}>{l.toUpperCase()} · {LANG_NAMES[l]}</option>)}
                            </select>
                            <span className="lang-code" aria-hidden="true">{lang.toUpperCase()}</span>
                        </label>
                        <button className="btn btn-primary btn-s" onClick={onPlay}>{Icon.play}{tr('Jouer', 'Play', 'Jogar')}</button>
                    </div>
                </div>
            </nav>

            <header className="about-hero" id="top">
                {hero3d ? <Suspense fallback={null}><HeroScene /></Suspense> : null}
                <div className="hero-shade" aria-hidden="true" />
                <div className="wrap hero-copy">
                    <p className="eyebrow">{tr('À propos de l\'auteur', 'About the author', 'Sobre o autor')}</p>
                    <h1><span className="grad">{user.name}</span></h1>
                    <p className="lead">{field(highlights, 'tagline')}</p>
                    <ul className="chips">
                        {field(highlights, 'facts').map((f) => <li key={f} className="chip"><i />{f}</li>)}
                    </ul>
                    <div className="cta">
                        <button className="btn btn-primary" onClick={onPlay}>{Icon.play}{tr('Jouer à Ride', 'Play Ride', 'Jogar Ride')}</button>
                        <a className="btn btn-ghost" href={user.url} target="_blank" rel="noreferrer">{Icon.github}GitHub · {user.login}</a>
                        {showcase.linkedin ? <a className="btn btn-ghost" href={showcase.linkedin} target="_blank" rel="noreferrer">{Icon.linkedin}{tr('Parcours pro', 'Career', 'Carreira')}</a> : null}
                        <a className="btn btn-ghost" href={`mailto:${user.mail}`}>{Icon.mail}{tr('Contact', 'Contact', 'Contato')}</a>
                    </div>
                </div>
                <p className="hero-caption">{tr('Rendu en temps réel : mon avatar sur la mer d\'Ocearo', 'Real-time render: my avatar on the Ocearo sea', 'Renderização em tempo real: meu avatar no mar do Ocearo')}</p>
            </header>


            <section className="section water" id="mer">
                <div className="wrap water-grid">
                    <figure className="portrait">
                        <img src={IMG + 'barre.webp'} alt={tr('Matthieu à la barre d\'un voilier, en ciré, gilet et longe', 'Matthieu at the helm of a sailing boat, in oilskins, lifejacket and tether', 'Matthieu no leme de um veleiro, de capa de chuva, colete e cabo de segurança')} loading="lazy" />
                        <figcaption><span>{tr('À la barre', 'At the helm', 'No leme')}</span></figcaption>
                    </figure>
                    <div className="water-copy">
                        <div className="section-head">
                            <p className="eyebrow">{tr('Sur l\'eau', 'On the water', 'Na água')}</p>
                            <h2>{tr('Voile, planche à voile, plongée', 'Sailing, windsurfing, diving', 'Vela, windsurf, mergulho')}</h2>
                            <p className="lead">{tr('La plupart de ces projets sont partis d\'un besoin sur l\'eau : savoir s\'il y aura du vent, voir le trafic la nuit, surveiller le mouillage.', 'Most of these projects started from a need on the water: knowing whether there will be wind, seeing the traffic at night, keeping an eye on the anchor.', 'A maioria destes projetos nasceu de uma necessidade na água: saber se vai ter vento, ver o tráfego à noite, vigiar a âncora.')}</p>
                        </div>
                        <div className="gallery">
                            {PHOTOS.map((p, i) => (
                                <button key={p.src} className={`shot ${p.wide ? 'wide' : ''}`} onClick={() => setPhoto({ list: gallery, i })} aria-label={`${tr('Agrandir', 'Enlarge', 'Ampliar')} : ${field(p, 'alt')}`}>
                                    <img src={IMG + p.src} alt={field(p, 'alt')} loading="lazy" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
            {photo ? <Lightbox i={photo.i} list={photo.list} onClose={() => setPhoto(null)}
                               onGo={(d) => setPhoto({ ...photo, i: (photo.i + d + photo.list.length) % photo.list.length })} /> : null}

            <section className="section" id="projets">
                <div className="wrap">
                    <div className="section-head">
                        <p className="eyebrow">{tr('Projets', 'Projects', 'Projetos')}</p>
                        <h2>{tr('Logiciel, électronique, construction', 'Software, electronics, building', 'Software, eletrônica, construção')}</h2>
                        <p className="lead">{tr('Logiciel de navigation, capteurs et objets construits de A à Z. Le code est sur GitHub quand il y en a.', 'Navigation software, sensors and things built from scratch. The code is on GitHub when there is some.', 'Software de navegação, sensores e objetos construídos do zero. O código está no GitHub quando existe.')}</p>
                    </div>
                    <div className="projects">
                        {showcase.projects.map((p, i) => (
                            <article key={p.id} className={`project ${i % 2 ? 'flip' : ''}`}>
                                <div className={`project-img ${p.contain ? 'contain' : ''}`}><img src={PROJ + p.image} alt={field(p, 'alt')} loading="lazy" /></div>
                                <div className="project-copy">
                                    <p className="eyebrow">{field(p, 'kicker')}</p>
                                    <h3>{p.name}</h3>
                                    <p>{field(p, 'text')}</p>
                                    {p.more ? (
                                        <div className="project-more">
                                            {p.more.map((m, k) => (
                                                <button key={m.src} className="shot mini" aria-label={`${tr('Agrandir', 'Enlarge', 'Ampliar')} : ${field(m, 'alt')}`}
                                                        onClick={() => setPhoto({ list: [{ url: PROJ + p.image, alt: field(p, 'alt') }, ...p.more.map((x) => ({ url: PROJ + x.src, alt: field(x, 'alt') }))], i: k + 1 })}>
                                                    <img src={PROJ + m.src} alt={field(m, 'alt')} loading="lazy" />
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    {p.links.length ? (
                                        <div className="project-links">
                                            {p.links.map((l) => <a key={l.url} className="btn btn-ghost btn-s" href={l.url} target="_blank" rel="noreferrer">{field(l, 'label')}{Icon.arrow}</a>)}
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
                        <p className="eyebrow">{tr('Le jeu', 'The game', 'O jogo')}</p>
                        <h2>{tr('Ride, sur la mer d\'Ocearo', 'Ride, on the Ocearo sea', 'Ride, no mar do Ocearo')}</h2>
                        <p className="lead">{tr('Un jeu de planche à voile et de wing foil dans le navigateur, avec mon avatar 3D, sur la mer et le ciel d\'Ocearo UI. Il s\'installe aussi comme une application sur téléphone.', 'A windsurfing and wing foiling game in the browser, with my 3D avatar, on the sea and sky of Ocearo UI. It also installs as an app on a phone.', 'Um jogo de windsurf e wing foil no navegador, com meu avatar 3D, no mar e no céu do Ocearo UI. Também pode ser instalado como aplicativo no celular (o jogo está em inglês).')}</p>
                        <ul className="ticks">
                            {lang === 'fr' ? <>
                                <li><span><b>Freestyle, slalom, balade</b> : combos, chrono, 21 défis et records.</span></li>
                                <li><span><b>Les figures du freestyle</b>, à une, deux ou trois tapes : forward, back et push loops, table-top, Vulcan, Spock, Flaka, duck jibe, hélitack.</span></li>
                                <li><span><b>Le pumping</b> pour décoller en wing, les vagues pour tremplin, le vol en foil, les gerbes et le son.</span></li>
                                <li><span><b>Clavier, tactile ou manette PlayStation</b>, et une démo qui enchaîne tout.</span></li>
                            </> : lang === 'pt' ? <>
                                <li><span><b>Freestyle, slalom, passeio</b>: combos, cronômetro, 21 desafios e recordes.</span></li>
                                <li><span><b>As manobras do freestyle</b>, com um, dois ou três toques: forward, back e push loops, table-top, Vulcan, Spock, Flaka, duck jibe, helitack.</span></li>
                                <li><span><b>Pumping</b> para decolar no wing, ondas como rampa, voo no foil, spray e som.</span></li>
                                <li><span><b>Teclado, toque ou controle PlayStation</b>, e uma demonstração que mostra tudo.</span></li>
                            </> : <>
                                <li><span><b>Freestyle, slalom, cruise</b>: combos, a clock, 21 challenges and records.</span></li>
                                <li><span><b>Freestyle moves</b>, with one, two or three taps: forward, back and push loops, table-top, Vulcan, Spock, Flaka, duck jibe, helitack.</span></li>
                                <li><span><b>Pumping</b> to take off on the wing, waves as ramps, foil flight, spray and sound.</span></li>
                                <li><span><b>Keyboard, touch or PlayStation controller</b>, and a demo that runs through everything.</span></li>
                            </>}
                        </ul>
                        <div className="cta left"><button className="btn btn-primary" onClick={onPlay}>{Icon.play}{tr('Jouer maintenant', 'Play now', 'Jogar agora')}</button></div>
                    </div>
                    <button className="media" onClick={onPlay} aria-label={tr('Jouer à Ride', 'Play Ride', 'Jogar Ride')}>
                        <img src={`${import.meta.env.BASE_URL}img/windsurfer.webp`} alt={tr('Le jeu Ride : le planchiste sur la mer d\'Ocearo', 'The Ride game: the windsurfer on the Ocearo sea', 'O jogo Ride: o windsurfista no mar do Ocearo')} loading="lazy" />
                        <span className="media-play">{Icon.play}</span>
                        <span className="tag">JP Australia Magic Ride 119 · Duotone E_Pace 6.2</span>
                    </button>
                </div>
            </section>


            <footer className="about-foot">
                <div className="wrap">
                    <span>© {new Date().getFullYear()} {user.name} · <a href={`mailto:${user.mail}`}>{user.mail}</a>{showcase.linkedin ? <> · <a href={showcase.linkedin} target="_blank" rel="noreferrer">{tr('parcours pro sur LinkedIn', 'career on LinkedIn', 'carreira no LinkedIn')}</a></> : null}</span>
                    <span>{tr('Mer, ciel et vagues : ', 'Sea, sky and waves: ', 'Mar, céu e ondas: ')}<a href="https://github.com/laborima/ocearo-ui" target="_blank" rel="noreferrer">Ocearo UI</a> · {tr('Polices Geist', 'Geist fonts', 'Fontes Geist')}</span>
                </div>
            </footer>
        </div>
    );
}
