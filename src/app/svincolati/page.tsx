// src/app/svincolati/page.tsx
"use client";

import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
    useDeferredValue,
} from "react";
import Papa from "papaparse";

type GameMode = "MANTRA" | "CLASSIC";

type CsvRow = Record<string, unknown>;

type TeamColor = { badge: string; text: string };

type TeamRosterPlayer = {
    extId: number;
    name: string;
    roleMantra?: string | null;
    roleClassic?: string | null;
};

type SvincolatoPlayer = {
    extId: number;
    name: string;
    team: string;
    roleMantra?: string | null;
    roleClassic?: string | null;
    pg: number | null;
    mv: number | null;
    fm: number | null;
};

type RecommendationRow = SvincolatoPlayer & {
    pt_mv_rank?: number;
    pt_fm_rank?: number;
    pt_duel_mv?: number;
    pt_duel_fmv?: number;
    total?: number;
};

function toNum(v: unknown): number | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

function isEmpty(v: unknown) {
    return v == null || String(v).trim() === "";
}

const MANTRA_ROLES = ["Por", "Dc", "Dd", "Ds", "E", "M", "C", "W", "T", "A", "Pc"];
const CLASSIC_ROLES = ["P", "D", "C", "A"];

function tierFromRank(pos1based: number) {
    if (pos1based <= 4) return 1;
    if (pos1based <= 8) return 2;
    if (pos1based <= 12) return 3;
    if (pos1based <= 16) return 4;
    return 5;
}

function colorFromTier(tier: 1 | 2 | 3 | 4 | 5): TeamColor {
    switch (tier) {
        case 1:
            return { badge: "bg-lime-400 text-black", text: "text-lime-700" };
        case 2:
            return { badge: "bg-emerald-400 text-black", text: "text-emerald-700" };
        case 3:
            return { badge: "bg-yellow-400 text-black", text: "text-yellow-700" };
        case 4:
            return { badge: "bg-orange-400 text-black", text: "text-orange-700" };
        case 5:
            return { badge: "bg-red-500 text-white", text: "text-red-700" };
    }
}

function normTeamName(s: string) {
    return (s ?? "").trim();
}

function canonicalTeamName(s: string) {
    const t = normTeamName(s);
    const lower = t.toLowerCase();

    // Verona
    if (lower === "hellas verona" || lower === "hellasverona" || lower === "ver") return "Verona";

    // Abbreviazioni tipiche listone
    const map: Record<string, string> = {
        ata: "Atalanta",
        bol: "Bologna",
        cag: "Cagliari",
        com: "Como",
        emp: "Empoli",
        fio: "Fiorentina",
        gen: "Genoa",
        int: "Inter",
        juv: "Juventus",
        laz: "Lazio",
        lec: "Lecce",
        mil: "Milan",
        mon: "Monza",
        nap: "Napoli",
        par: "Parma",
        rom: "Roma",
        sal: "Salernitana",
        sas: "Sassuolo",
        tor: "Torino",
        udi: "Udinese",
        ven: "Venezia",
    };
    if (map[lower]) return map[lower];

    return t;
}

function teamKey(s: string) {
    const canon = canonicalTeamName(s);
    return normTeamName(canon)
        .toLowerCase()
        .replace(/[’'`.]/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function getRoleForMode(
    mode: GameMode,
    p: { roleMantra?: string | null; roleClassic?: string | null }
) {
    if (mode === "CLASSIC") return String(p.roleClassic ?? "").trim();
    return String(p.roleMantra ?? "").trim();
}

function getRolesList(mode: GameMode) {
    return mode === "CLASSIC" ? CLASSIC_ROLES : MANTRA_ROLES;
}

/** normalizza header: lower + remove spazi/punti/underscore */
function normKey(k: string) {
    return String(k ?? "")
        .replace(/^\uFEFF/, "")
        .trim()
        .toLowerCase()
        .replace(/[\s._()-]+/g, "");
}

/**
 * Legge un campo in modo robusto:
 * - prova chiavi esatte
 * - poi prova match per normalizzazione (ignora punti/spazi/underscore e case)
 */
function readCsvField(r: CsvRow, keys: string[]) {
    // 1) exact
    for (const k of keys) {
        const v = r[k];
        if (!isEmpty(v)) return v;
    }

    // 2) normalized match
    const wanted = keys.map(normKey);
    const rowKeys = Object.keys(r);

    for (const rk of rowKeys) {
        const nk = normKey(rk);
        if (!wanted.includes(nk)) continue;
        const v = r[rk];
        if (!isEmpty(v)) return v;
    }

    return undefined;
}

export default function SvincolatiPage() {
    const [mode, setMode] = useState<GameMode>("MANTRA");

    const [teamPlayers, setTeamPlayers] = useState<TeamRosterPlayer[]>([]);
    const [selectedExtId, setSelectedExtId] = useState<number | null>(null);

    const [svPlayers, setSvPlayers] = useState<SvincolatoPlayer[]>([]);
    const [byRole, setByRole] = useState<Record<string, RecommendationRow[]>>({});
    const [loading, setLoading] = useState(false);

    const [teamColorByKey, setTeamColorByKey] = useState<Map<string, TeamColor>>(new Map());

    // ✅ FILTRI UI
    const [selectedRole, setSelectedRole] = useState<string>(""); // "" = tutti
    const [searchName, setSearchName] = useState<string>("");

    // ✅ NOTE DB
    const [notes, setNotes] = useState<Record<number, string>>({});
    const [notesLoading, setNotesLoading] = useState(false);
    const [savingByKey, setSavingByKey] = useState<Record<number, boolean>>({});
    const [savedTickByKey, setSavedTickByKey] = useState<Record<number, boolean>>({});

    const saveTickTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

    const deferredSearchName = useDeferredValue(searchName);

    const getTeamColor = useCallback(
        (teamName: string) => teamColorByKey.get(teamKey(teamName)),
        [teamColorByKey]
    );

    const svExtIdSet = useMemo(() => {
        const s = new Set<number>();
        for (const p of svPlayers) {
            const id = Number(p?.extId);
            if (Number.isFinite(id)) s.add(id);
        }
        return s;
    }, [svPlayers]);

    async function loadNotes() {
        setNotesLoading(true);
        try {
            const r = await fetch("/api/svincolati/notes", { cache: "no-store" });
            if (!r.ok) return;
            const d = await r.json();
            setNotes(d?.notes ?? {});
        } catch {
        } finally {
            setNotesLoading(false);
        }
    }

    async function saveNote(playerKey: number, note: string) {
        if (!Number.isFinite(playerKey)) return;

        setSavingByKey((prev) => ({ ...prev, [playerKey]: true }));
        setSavedTickByKey((prev) => ({ ...prev, [playerKey]: false }));

        try {
            const r = await fetch("/api/svincolati/notes", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ playerKey, note }),
            });
            if (!r.ok) return;

            const trimmed = String(note ?? "").trim();
            setNotes((prev) => {
                const next = { ...prev };
                if (trimmed.length === 0) delete next[playerKey];
                else next[playerKey] = note;
                return next;
            });

            setSavedTickByKey((prev) => ({ ...prev, [playerKey]: true }));

            if (saveTickTimers.current[playerKey]) clearTimeout(saveTickTimers.current[playerKey]);
            saveTickTimers.current[playerKey] = setTimeout(() => {
                setSavedTickByKey((prev) => ({ ...prev, [playerKey]: false }));
            }, 1200);
        } catch {
        } finally {
            setSavingByKey((prev) => ({ ...prev, [playerKey]: false }));
        }
    }

    useEffect(() => {
        loadNotes();

        const timers = saveTickTimers.current;
        return () => {
            for (const k of Object.keys(timers)) {
                const id = timers[Number(k)];
                if (id) clearTimeout(id);
                delete timers[Number(k)];
            }
        };
    }, []);

    // ✅ carica gameMode utente
    useEffect(() => {
        let alive = true;

        async function loadMode() {
            try {
                const r = await fetch("/api/me/game-mode", { cache: "no-store" });
                if (!r.ok) return;
                const d = await r.json();
                const gm = String(d?.gameMode ?? "MANTRA").toUpperCase();
                if (!alive) return;
                if (gm === "CLASSIC" || gm === "MANTRA") setMode(gm as GameMode);
            } catch {
            }
        }

        loadMode();
        return () => {
            alive = false;
        };
    }, []);

    // ✅ colori squadre
    useEffect(() => {
        let alive = true;

        async function loadColors() {
            try {
                const res = await fetch("/api/logica/fav-rows", { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();

                const fav = Array.isArray(data?.favRows) ? data.favRows : [];
                if (!fav.length) return;

                const map = new Map<string, TeamColor>();
                for (let i = 0; i < fav.length; i++) {
                    const pos = i + 1;
                    const tier = tierFromRank(pos) as 1 | 2 | 3 | 4 | 5;
                    const t = fav[i]?.team ?? "";
                    if (!t) continue;
                    map.set(teamKey(String(t)), colorFromTier(tier));
                }

                if (alive) setTeamColorByKey(map);
            } catch {
            }
        }

        loadColors();
        return () => {
            alive = false;
        };
    }, []);

    // ✅ roster del team (per confronto)
    useEffect(() => {
        fetch("/api/team/players")
            .then((r) => r.json())
            .then((d) => {
                const roster = (d?.roster ?? []) as Array<{ player?: TeamRosterPlayer }>;
                setTeamPlayers(
                    roster
                        .map((x) => ({
                            extId: Number(x?.player?.extId),
                            name: String(x?.player?.name ?? ""),
                            roleMantra: x?.player?.roleMantra ?? null,
                            roleClassic: x?.player?.roleClassic ?? null,
                        }))
                        .filter((p) => Number.isFinite(p.extId) && p.name.length > 0)
                );
            })
            .catch(() => { });
    }, []);

    const recompute = useCallback(
        async (players: SvincolatoPlayer[], sel: number | null, gm: GameMode) => {
            setLoading(true);
            try {
                const res = await fetch("/api/svincolati/recommendations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ players, selectedExtId: sel, gameMode: gm }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                    byRole?: Record<string, RecommendationRow[]>;
                };
                setByRole(data.byRole ?? {});
            } finally {
                setLoading(false);
            }
        },
        []
    );

    const onFile = useCallback(
        (file: File) => {
            Papa.parse<CsvRow>(file, {
                header: true,
                // ✅ IMPORTANTISSIMO: autodetect delimiter (molti CSV svincolati sono "," e non ";")
                delimiter: "",
                skipEmptyLines: true,
                transformHeader: (h) => String(h ?? "").replace(/^\uFEFF/, "").trim(),
                complete: (res) => {
                    const rows = (res.data ?? []).filter(Boolean);

                    const players: SvincolatoPlayer[] = rows
                        .filter((r) => isEmpty(r["Fuori lista"]) && isEmpty(r["FuoriLista"]) && isEmpty(r["Fuori_lista"]))
                        .map((r) => {
                            // ✅ ruoli: supporta R, R., RUOLO, R CLASSIC ecc.
                            const roleMantra = readCsvField(r, [
                                "R.MANTRA",
                                "R MANTRA",
                                "RMANTRA",
                                "RUOLOMANTRA",
                                "RUOLO MANTRA",
                            ]);

                            const roleClassic = readCsvField(r, [
                                "R",
                                "R.",
                                "RUOLO",
                                "RUOLOCLASSIC",
                                "RUOLO CLASSIC",
                                "R.CLASSIC",
                                "R CLASSIC",
                                "R.CLA",
                                "R CLA",
                            ]);

                            const p: SvincolatoPlayer = {
                                extId: Number(
                                    readCsvField(r, ["#", "Id", "ID", "id", "Codice", "CODICE"])
                                ),
                                name: String(readCsvField(r, ["Nome", "Giocatore", "Calciatore"]) ?? ""),
                                team: String(readCsvField(r, ["Sq.", "Sq", "Squadra", "Team", "Squadra."]) ?? ""),

                                roleMantra: roleMantra != null ? String(roleMantra).trim() : null,
                                roleClassic: roleClassic != null ? String(roleClassic).trim() : null,

                                pg: toNum(readCsvField(r, ["PGv", "PG", "Pres", "Presenze"])),
                                mv: toNum(readCsvField(r, ["MV", "M/V", "MediaVoto"])),
                                fm: toNum(readCsvField(r, ["FM", "FMV", "FantaMedia", "Fantamedia"])),
                            };
                            return p;
                        })
                        .filter((p) => Number.isFinite(p.extId) && p.name.trim().length > 0);

                    // ✅ in Classic tengo solo player con roleClassic valorizzato
                    const filtered =
                        mode === "CLASSIC"
                            ? players.filter((p) => String(p.roleClassic ?? "").trim().length > 0)
                            : players.filter((p) => String(p.roleMantra ?? "").trim().length > 0);

                    if (mode === "CLASSIC" && filtered.length === 0) {
                        // debug utilissimo: ti dice quali header ci sono davvero nel CSV
                        // così se serve aggiungiamo un alias specifico
                        // eslint-disable-next-line no-console
                        console.warn("[SVINCOLATI] Classic: 0 giocatori dopo filtro. Headers CSV:", res.meta?.fields);
                        // eslint-disable-next-line no-console
                        console.warn("[SVINCOLATI] Esempio prima riga:", rows[0]);
                    }

                    setSvPlayers(filtered);
                    recompute(filtered, selectedExtId, mode);
                },
            });
        },
        [mode, recompute, selectedExtId]
    );

    useEffect(() => {
        if (svPlayers.length) recompute(svPlayers, selectedExtId, mode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedExtId, mode]);

    const removeSvincolato = useCallback(
        (extIdToRemove: number) => {
            setSvPlayers((prev) => {
                const next = prev.filter((p) => Number(p.extId) !== Number(extIdToRemove));
                recompute(next, selectedExtId, mode);
                return next;
            });
        },
        [recompute, selectedExtId, mode]
    );

    const searchLower = useMemo(
        () => deferredSearchName.trim().toLowerCase(),
        [deferredSearchName]
    );

    const rolesUniverse = useMemo(() => getRolesList(mode), [mode]);

    const availableRoles = useMemo(() => {
        const has = (r: string) => (byRole[r] ?? []).length > 0;
        return rolesUniverse.filter(has);
    }, [byRole, rolesUniverse]);

    const baseRolesToShow = useMemo(() => {
        if (selectedRole) return [selectedRole];

        if (selectedExtId == null) return rolesUniverse;

        return rolesUniverse.filter((r) =>
            (byRole[r] ?? []).some((p) => Number(p.extId) === Number(selectedExtId))
        );
    }, [byRole, selectedExtId, selectedRole, rolesUniverse]);

    const rolesToShow = useMemo(() => {
        const base = baseRolesToShow;
        if (searchLower.length === 0) return base;

        return base.filter((role) => {
            const list = byRole[role] ?? [];
            return list.some((p) => String(p.name ?? "").toLowerCase().includes(searchLower));
        });
    }, [baseRolesToShow, byRole, searchLower]);

    const roleLabel = mode === "CLASSIC" ? "R.CLASSIC" : "R.MANTRA";

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl font-semibold">Consigli svincolati</h1>
                <div className="text-xs text-gray-500">
                    {notesLoading ? "Carico note…" : "Note: salvate su DB"}
                </div>
            </div>

            <div className="flex gap-4 items-center flex-wrap">
                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => e.target.files && onFile(e.target.files[0])}
                />

                <select
                    className="border px-2 py-1"
                    value={selectedExtId ?? ""}
                    onChange={(e) => setSelectedExtId(e.target.value ? Number(e.target.value) : null)}
                >
                    <option value="">(confronta con un tuo giocatore)</option>
                    {teamPlayers.map((p) => (
                        <option key={p.extId} value={p.extId}>
                            {p.name} ({getRoleForMode(mode, p)})
                        </option>
                    ))}
                </select>

                <select
                    className="border px-2 py-1"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                >
                    <option value="">(tutti i ruoli)</option>
                    {availableRoles.map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>

                <input
                    className="border px-2 py-1"
                    placeholder="Cerca per nome…"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                />

                {loading && <span className="text-sm text-gray-500">Calcolo…</span>}

                {svPlayers.length > 0 && (
                    <span className="text-sm text-gray-600">
                        Svincolati caricati: <b>{svPlayers.length}</b>
                    </span>
                )}

                {svPlayers.length === 0 && (
                    <span className="text-sm text-gray-500">
                        (Carica un CSV per vedere i consigli)
                    </span>
                )}
            </div>

            {searchLower.length > 0 && rolesToShow.length === 0 && (
                <div className="text-sm text-gray-500">Nessun risultato per la ricerca.</div>
            )}

            {rolesToShow.map((role) => {
                const rawList = (byRole[role] ?? []) as RecommendationRow[];
                if (!rawList.length) return null;

                const list =
                    searchLower.length === 0
                        ? rawList
                        : rawList.filter((p) => String(p.name ?? "").toLowerCase().includes(searchLower));

                if (!list.length) return null;

                const me =
                    selectedExtId != null
                        ? rawList.find((p) => Number(p.extId) === Number(selectedExtId))
                        : null;
                const meTot = me ? Number(me.total ?? 0) : null;

                return (
                    <div key={role} className="space-y-2">
                        <h2 className="text-xl font-semibold">{role}</h2>

                        <div className="overflow-x-auto border rounded">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2">#</th>
                                        <th className="px-3 py-2 text-left">Giocatore</th>
                                        <th className="px-3 py-2">Sq</th>
                                        <th className="px-3 py-2">{roleLabel}</th>
                                        <th className="px-3 py-2">PG</th>
                                        <th className="px-3 py-2">MV</th>
                                        <th className="px-3 py-2">FM</th>
                                        <th className="px-3 py-2">Pt MV</th>
                                        <th className="px-3 py-2">Pt FM</th>
                                        <th className="px-3 py-2">Pt Duel MV</th>
                                        <th className="px-3 py-2">Pt Duel FMV</th>
                                        <th className="px-3 py-2">Tot</th>
                                        <th className="px-3 py-2 text-left">Note</th>
                                        <th className="px-3 py-2"></th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {list.map((p, i) => {
                                        const tot = Number(p.total ?? 0);

                                        let bgColor: string | undefined = undefined;
                                        if (meTot != null) {
                                            if (tot > meTot) bgColor = "#ecfdf5";
                                            else if (tot < meTot) bgColor = "#fef2f2";
                                            else bgColor = "#fefce8";
                                        }

                                        const isMe =
                                            selectedExtId != null && Number(p.extId) === Number(selectedExtId);

                                        const isFromCsv = svExtIdSet.has(Number(p.extId));
                                        const canDelete = isFromCsv && !isMe;

                                        const c = getTeamColor(p.team ?? "");

                                        const key = Number(p.extId);
                                        const noteValue = notes[key] ?? "";
                                        const saving = !!savingByKey[key];
                                        const savedTick = !!savedTickByKey[key];

                                        const roleValue = getRoleForMode(mode, p);

                                        return (
                                            <tr
                                                key={`${p.extId}-${role}-${i}`}
                                                className={`border-t ${isMe ? "font-semibold" : ""}`}
                                                style={bgColor ? { backgroundColor: bgColor } : undefined}
                                            >
                                                <td className="px-3 py-2">{i + 1}</td>

                                                <td className={`px-3 py-2 text-left ${c ? c.text : ""}`}>
                                                    {p.name}
                                                </td>

                                                <td className="px-3 py-2 text-center">
                                                    {p.team ? (
                                                        <span
                                                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c ? c.badge : "bg-gray-100 text-gray-700"
                                                                }`}
                                                        >
                                                            {p.team}
                                                        </span>
                                                    ) : (
                                                        "-"
                                                    )}
                                                </td>

                                                <td className="px-3 py-2 text-center">{roleValue || "-"}</td>

                                                <td className="px-3 py-2 text-right">{p.pg ?? "-"}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {p.mv == null ? "-" : Number(p.mv).toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2 text-right">
                                                    {p.fm == null ? "-" : Number(p.fm).toFixed(2)}
                                                </td>

                                                <td className="px-3 py-2 text-right">{p.pt_mv_rank ?? "-"}</td>
                                                <td className="px-3 py-2 text-right">{p.pt_fm_rank ?? "-"}</td>
                                                <td className="px-3 py-2 text-right">{p.pt_duel_mv ?? "-"}</td>
                                                <td className="px-3 py-2 text-right">{p.pt_duel_fmv ?? "-"}</td>

                                                <td className="px-3 py-2 text-right font-semibold">
                                                    {Number.isFinite(tot) ? tot.toFixed(2) : "-"}
                                                </td>

                                                <td className="px-3 py-2 align-top">
                                                    <div className="flex flex-col gap-1 min-w-[260px]">
                                                        <textarea
                                                            className="w-full min-h-[42px] resize-y border rounded px-2 py-1 text-sm font-normal"
                                                            placeholder="Scrivi una nota… (salva quando esci)"
                                                            value={noteValue}
                                                            onChange={(e) => {
                                                                const v = e.target.value;
                                                                setNotes((prev) => ({ ...prev, [key]: v }));
                                                            }}
                                                            onBlur={(e) => {
                                                                saveNote(key, e.target.value);
                                                            }}
                                                        />
                                                        <div className="h-4 text-[11px]">
                                                            {saving ? (
                                                                <span className="text-gray-500">Salvo…</span>
                                                            ) : savedTick ? (
                                                                <span className="text-emerald-700">Salvato ✓</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-3 py-2 text-right">
                                                    {canDelete ? (
                                                        <button
                                                            className="text-gray-600 hover:text-red-600"
                                                            title="Rimuovi dalla lista svincolati"
                                                            onClick={() => removeSvincolato(Number(p.extId))}
                                                        >
                                                            🗑️
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-300" title={isMe ? "Giocatore selezionato" : ""}>
                                                            🗑️
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
