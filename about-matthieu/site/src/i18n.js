// French, English or Brazilian Portuguese: the browser's preferred languages decide (the first of them that the site
// speaks; English when none); a ?lang=fr|en|pt link or the language menu overrides it and is remembered. Portuguese
// covers the page; texts without a Portuguese version (the game) fall back to English. Plain module state, so the game
// logic (physics.js, session.js) can read it too; React components subscribe with useLang().
import { useEffect, useState } from 'react';

const KEY = 'about-matthieu.lang';
export const LANGS = ['fr', 'en', 'pt'];
export const LANG_NAMES = { fr: 'Français', en: 'English', pt: 'Português' };
const HTML_LANG = { fr: 'fr', en: 'en', pt: 'pt-BR' };

export const detectLang = () => {
    try {
        const q = new URLSearchParams(window.location.search).get('lang');
        if (LANGS.includes(q)) return q;
        const v = localStorage.getItem(KEY);
        if (LANGS.includes(v)) return v;
    } catch { /* private mode: no storage */ }
    const list = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language || '']) : [];
    for (const l of list) {
        const base = String(l).toLowerCase().slice(0, 2);
        if (LANGS.includes(base)) return base;
    }
    return 'en';
};

let lang = typeof window !== 'undefined' ? detectLang() : 'fr';
const subs = new Set();

export const getLang = () => lang;
export const setLang = (l) => {
    if (!LANGS.includes(l) || l === lang) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch { /* keep it for this visit only */ }
    if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[l];
    subs.forEach((f) => f(l));
};
if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lang];

/** [lang, setLang]: re-renders the component when the language changes. */
export const useLang = () => {
    const [l, set] = useState(lang);
    useEffect(() => { subs.add(set); set(lang); return () => { subs.delete(set); }; }, []);
    return [l, setLang];
};

/** Pick the text for the current language: tr('Bonjour', 'Hello', 'Olá') (no Portuguese: the English one). */
export const tr = (fr, en, pt) => (lang === 'fr' ? fr : lang === 'pt' && pt !== undefined ? pt : en);

/** A field of a data object in the current language: field(p, 'text') reads p.text_en / p.text_pt when there is one
 *  (Portuguese falls back to English, then French). */
export const field = (o, k) => {
    if (lang === 'fr') return o?.[k];
    if (lang === 'pt' && o?.[`${k}_pt`] != null) return o[`${k}_pt`];
    return o?.[`${k}_en`] ?? o?.[k];
};
