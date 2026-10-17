// French or English: the browser's preferred languages decide (French if French comes before English, English
// otherwise); a ?lang=fr|en link or the FR / EN button overrides it and is remembered. Plain module state, so the game
// logic (physics.js, session.js) can read it too; React components subscribe with useLang().
import { useEffect, useState } from 'react';

const KEY = 'about-matthieu.lang';
const LANGS = ['fr', 'en'];

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
    if (typeof document !== 'undefined') document.documentElement.lang = l;
    subs.forEach((f) => f(l));
};
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** [lang, setLang]: re-renders the component when the language changes. */
export const useLang = () => {
    const [l, set] = useState(lang);
    useEffect(() => { subs.add(set); set(lang); return () => { subs.delete(set); }; }, []);
    return [l, setLang];
};

/** Pick the text for the current language: tr('Bonjour', 'Hello'). */
export const tr = (fr, en) => (lang === 'en' ? en : fr);

/** A field of a data object in the current language: field(p, 'text') reads p.text_en in English when there is one. */
export const field = (o, k) => (lang === 'en' && o?.[`${k}_en`] != null ? o[`${k}_en`] : o?.[k]);
