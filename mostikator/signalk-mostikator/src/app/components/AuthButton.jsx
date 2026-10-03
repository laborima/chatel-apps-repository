"use client";

import { useState, useEffect } from "react";
import { hasControlKey, login, logout } from "../services/deviceService";

/**
 * Control password (arm, sound, settings, shots). Asked once, remembered by this browser; reading the
 * camera, the targets and the log never needs it. A refused command also asks for it on its own.
 */
export default function AuthButton() {
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        const sync = () => setAuthed(hasControlKey());
        sync();
        window.addEventListener("mostikator-auth", sync);
        return () => window.removeEventListener("mostikator-auth", sync);
    }, []);

    return authed
        ? <button className="mk-btn text-xs" onClick={logout} title="Oublier le mot de passe sur cet appareil">🔓 Contrôle</button>
        : <button className="mk-btn mk-btn-amber text-xs" onClick={() => login().catch(() => {})} title="Armer, son, réglages">🔒 S&apos;authentifier</button>;
}
