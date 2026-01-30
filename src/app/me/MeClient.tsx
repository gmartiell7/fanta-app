"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";


type GameMode = "MANTRA" | "CLASSIC";
type StatRow = {
    matchday: number;
    vote: number | null;
    gf: number;
    gs: number;
    rp: number;
    rs: number;
    rf: number;
    au: number;
    amm: number;
    esp: number;
    ass: number;
};

type PlayerFromDB = {
    id: string;
    name: string;
    team: string;
    roleMantra: string | null;
    roleClassic?: string | null;
    stats?: StatRow[];
};

function splitRoles(role?: string | null) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
function normRole(r: string) {
    const x = r.trim();
    if (!x) return "";
    const lower = x.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function roleStringForMode(p: PlayerFromDB, mode: GameMode) {
    return mode === "CLASSIC" ? String(p.roleClassic ?? "") : String(p.roleMantra ?? "");
}


function calcMvFromStats(stats: Pick<StatRow, "vote">[]): number | null {
    const votes = stats.map((s) => s.vote).filter((v): v is number => v !== null);
    if (votes.length === 0) return null;
    return votes.reduce((a, b) => a + b, 0) / votes.length;
}

function calcFmvMatch(s: Omit<StatRow, "matchday">): number | null {
    if (s.vote === null) return null;
    return (
        s.vote +
        s.gf * 3 -
        s.gs * 1 +
        s.rp * 3 -
        s.rs * 3 +
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

function calcFmvFromStats(stats: Omit<StatRow, "matchday">[]): number | null {
    const fmvs = stats.map(calcFmvMatch).filter((v): v is number => v !== null);
    if (fmvs.length === 0) return null;
    return fmvs.reduce((a, b) => a + b, 0) / fmvs.length;
}

type Row = {
    id: string;
    name: string;
    team: string;
    played: number;
    mv: number | null;
    fmv: number | null;

    voteByDay: Record<number, number>;
    fmvByDay: Record<number, number>;
    voteNullableByDay: Record<number, number | null>;
};

function computeDuelTotals(rows: Row[], totalMatchdays: number, getValueByDay: (r: Row, day: number) => number) {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.id, 0);

    for (let day = 1; day <= totalMatchdays; day++) {
        const vals = rows.map((r) => ({ id: r.id, v: getValueByDay(r, day) }));
        vals.sort((a, b) => a.v - b.v);

        const pointsById = new Map<string, number>();
        let i = 0;
        while (i < vals.length) {
            const v = vals[i].v;
            const firstIndex = i;
            let j = i;
            while (j < vals.length && vals[j].v === v) j++;
            for (let k = i; k < j; k++) pointsById.set(vals[k].id, firstIndex);
            i = j;
        }

        for (const r of rows) {
            totals.set(r.id, (totals.get(r.id) ?? 0) + (pointsById.get(r.id) ?? 0));
        }
    }

    const scored = rows.map((r) => ({
        id: r.id,
        pts: totals.get(r.id) ?? 0,
    }));

    scored.sort((a, b) => b.pts - a.pts);
    return scored;
}

function computeRankPtMap(rows: Row[], getMetric: (r: Row) => number | null) {
    const sorted = [...rows].sort((a, b) => {
        const am = getMetric(a) ?? -Infinity;
        const bm = getMetric(b) ?? -Infinity;
        if (bm !== am) return bm - am;
        if (b.played !== a.played) return b.played - a.played;
        return a.name.localeCompare(b.name);
    });

    const ptById = new Map<string, number>();
    for (let idx = 0; idx < sorted.length; idx++) {
        ptById.set(sorted[idx].id, Math.max(0, sorted.length - 1 - idx));
    }
    return ptById;
}

function computeRankPtMapFromScored(scored: { id: string }[]) {
    const ptById = new Map<string, number>();
    for (let idx = 0; idx < scored.length; idx++) {
        ptById.set(scored[idx].id, Math.max(0, scored.length - 1 - idx));
    }
    return ptById;
}

function hasBonusLast5(row: Row, totalMatchdays: number) {
    if (totalMatchdays < 5) return false;
    for (let day = totalMatchdays - 4; day <= totalMatchdays; day++) {
        const v = row.voteNullableByDay[day];
        if (v === null || v === undefined) return false;
        if (v <= 6.5) return false;
    }
    return true;
}

function computeTopFlopScoresByRole(players: PlayerFromDB[], mode: GameMode) {
    const items = players.map((p) => {
        const roles = splitRoles(roleStringForMode(p, mode)).map(normRole);

        const stats: StatRow[] = (p.stats ?? []).map((s) => ({
            matchday: Number(s.matchday ?? 0),
            vote: s.vote === null || s.vote === undefined ? null : Number(s.vote),
            gf: Number(s.gf ?? 0),
            gs: Number(s.gs ?? 0),
            rp: Number(s.rp ?? 0),
            rs: Number(s.rs ?? 0),
            rf: Number(s.rf ?? 0),
            au: Number(s.au ?? 0),
            amm: Number(s.amm ?? 0),
            esp: Number(s.esp ?? 0),
            ass: Number(s.ass ?? 0),
        }));

        const played = stats.filter((st) => st.vote !== null).length;

        const voteByDay: Record<number, number> = {};
        const fmvByDay: Record<number, number> = {};
        const voteNullableByDay: Record<number, number | null> = {};

        for (const s of stats) {
            voteNullableByDay[s.matchday] = s.vote;
            voteByDay[s.matchday] = s.vote ?? 0;
            fmvByDay[s.matchday] = calcFmvMatch(s) ?? 0;
        }

        const row: Row = {
            id: p.id,
            name: p.name,
            team: p.team,
            played,
            mv: calcMvFromStats(stats),
            fmv: calcFmvFromStats(stats),
            voteByDay,
            fmvByDay,
            voteNullableByDay,
        };

        return { row, roles };
    });

    const allMatchdays = players.flatMap((p) => (p.stats ?? []).map((s) => Number(s.matchday ?? 0)));
    const totalMatchdays = allMatchdays.length ? Math.max(...allMatchdays) : 0;

    const roleSet = new Set<string>();
    for (const it of items) for (const r of it.roles) if (r) roleSet.add(r);

    const scoreByRole = new Map<string, Map<string, number>>();

    for (const role of roleSet) {
        const rows = items.filter((it) => it.roles.includes(role)).map((it) => it.row);
        if (rows.length === 0) continue;

        const duelVote = computeDuelTotals(rows, totalMatchdays, (r, day) => r.voteByDay[day] ?? 0);
        const duelFmv = computeDuelTotals(rows, totalMatchdays, (r, day) => r.fmvByDay[day] ?? 0);

        const mvPtById = computeRankPtMap(rows, (r) => r.mv);
        const fmvPtById = computeRankPtMap(rows, (r) => r.fmv);
        const duelVotePtById = computeRankPtMapFromScored(duelVote);
        const duelFmvPtById = computeRankPtMapFromScored(duelFmv);

        const byId = new Map<string, number>();
        for (const r of rows) {
            const base =
                (mvPtById.get(r.id) ?? 0) +
                (fmvPtById.get(r.id) ?? 0) +
                (duelVotePtById.get(r.id) ?? 0) +
                (duelFmvPtById.get(r.id) ?? 0);

            const bonus = hasBonusLast5(r, totalMatchdays);
            const total = bonus ? base * 1.5 : base;
            byId.set(r.id, total);
        }

        scoreByRole.set(role, byId);
    }

    return { scoreByRole, totalMatchdays };
}

type ModuleDef = { name: string; slots: string[] };

const MODULES: ModuleDef[] = [
    { name: "3-4-1-2", slots: ["Por", "Dc", "Dc", "Dc/b", "E", "M/C", "C", "E", "T", "A/Pc", "A/Pc"] },
    { name: "3-4-2-1", slots: ["Por", "Dc", "Dc", "Dc/b", "E/W", "M", "M/C", "E", "T", "T/A", "A/Pc"] },
    { name: "3-4-3", slots: ["Por", "Dc", "Dc", "Dc/b", "E", "M/C", "C", "E", "W/A", "A/Pc", "W/A"] },
    { name: "3-5-1-1", slots: ["Por", "Dc", "Dc", "Dc/b", "E/W", "M", "C", "M", "E/W", "T/A", "A/Pc"] },
    { name: "3-5-2", slots: ["Por", "Dc", "Dc", "Dc/b", "E/W", "M/C", "M", "C", "E", "A/Pc", "A/Pc"] },
    { name: "4-1-4-1", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "E/W", "M", "C/T", "T", "W", "A/Pc"] },
    { name: "4-2-3-1", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "M", "M/C", "T/W", "T", "W/A", "A/Pc"] },
    { name: "4-3-1-2", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "M/C", "M", "C", "T", "T/A/Pc", "A/Pc"] },
    { name: "4-3-3", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "M/C", "M", "C", "W/A", "W/A", "A/Pc"] },
    { name: "4-4-1-1", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "E/W", "M", "C", "E/W", "T/A", "A/Pc"] },
    { name: "4-4-2", slots: ["Por", "Dd", "Dc", "Dc", "Ds", "E/W", "M/C", "C", "E", "A/Pc", "A/Pc"] },
];

const CLASSIC_MODULE_DEFS: ModuleDef[] = [
    { name: "3-4-3", slots: ["P", "D", "D", "D", "C", "C", "C", "C", "A", "A", "A"] },
    { name: "3-5-2", slots: ["P", "D", "D", "D", "C", "C", "C", "C", "C", "A", "A"] },
    { name: "4-3-3", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "A", "A", "A"] },
    { name: "4-4-2", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "C", "A", "A"] },
    { name: "4-5-1", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "C", "C", "A"] },
    { name: "5-3-2", slots: ["P", "D", "D", "D", "D", "D", "C", "C", "C", "A", "A"] },
    { name: "5-4-1", slots: ["P", "D", "D", "D", "D", "D", "C", "C", "C", "C", "A"] },
];


function expandRoleToken(token: string): string[] {
    const t = token.trim();
    const parts = t.split("/").map((x) => x.trim()).filter(Boolean);

    const out: string[] = [];
    for (const p of parts) {
        if (p.toLowerCase() === "b") out.push("Dd", "Ds", "Dc");
        else out.push(normRole(p));
    }
    return [...new Set(out)].filter(Boolean);
}

type LineupItem = {
    slot: string;
    player: PlayerFromDB;
    usedRole: string;
    score: number;
};

type PickBestLineupResult =
    | { selectable: true; lineup: LineupItem[] }
    | { selectable: false; lineup: LineupItem[] };


function pickBestLineup(
    players: PlayerFromDB[],
    scoreByRole: Map<string, Map<string, number>>,
    module: ModuleDef,
    mode: GameMode
): PickBestLineupResult {

    const playerRoles = new Map<string, string[]>();
    for (const p of players) playerRoles.set(p.id, splitRoles(roleStringForMode(p, mode)).map(normRole));

    for (const slot of module.slots) {
        const allowed = expandRoleToken(slot);
        const roleExists = allowed.some((r) => scoreByRole.has(r));
        if (!roleExists) return { selectable: false, lineup: [] };
    }

    const used = new Set<string>();
    const lineup: { slot: string; player: PlayerFromDB; usedRole: string; score: number }[] = [];

    for (const slot of module.slots) {
        const allowedRoles = expandRoleToken(slot);

        let best: { p: PlayerFromDB; usedRole: string; score: number } | null = null;

        for (const p of players) {
            if (used.has(p.id)) continue;

            const roles = playerRoles.get(p.id) ?? [];
            const compatibleRoles = allowedRoles.filter((r) => roles.includes(r));
            if (compatibleRoles.length === 0) continue;

            let bestScoreForP = -Infinity;
            let bestRoleForP = compatibleRoles[0];

            for (const r of compatibleRoles) {
                const score = scoreByRole.get(r)?.get(p.id);
                if (score === undefined) continue;
                if (score > bestScoreForP) {
                    bestScoreForP = score;
                    bestRoleForP = r;
                }
            }

            if (bestScoreForP === -Infinity) continue;
            if (!best || bestScoreForP > best.score) best = { p, usedRole: bestRoleForP, score: bestScoreForP };
        }

        if (!best) return { selectable: false, lineup: [] };

        used.add(best.p.id);
        lineup.push({ slot, player: best.p, usedRole: best.usedRole, score: best.score });
    }

    return { selectable: true as const, lineup };
}

function getLineGroup(slot: string, mode: GameMode) {
    const roles = expandRoleToken(slot);
    const has = (r: string) => roles.includes(r);

    if (mode === "CLASSIC") {
        if (has("P")) return "GK";
        if (has("D")) return "DEF";
        if (has("C")) return "MID";
        if (has("A")) return "ATT";
        return "MID";
    }

    if (has("Por")) return "GK";
    if (has("Dd") || has("Ds") || has("Dc")) return "DEF";
    if (has("W")) return "AM";
    if (has("E")) return "MID";
    if (has("M") || has("C")) return "MID";
    if (has("T")) return "AM";
    if (has("A") || has("Pc")) return "ATT";
    return "MID";
}

function PlayerChip({
    slot,
    usedRole,
    name,
    team,
    score,
}: {
    slot: string;
    usedRole: string;
    name: string;
    team: string;
    score: number;
}) {
    return (
        <div
            className="
        w-full max-w-[240px]
        rounded-2xl
        bg-white/10 backdrop-blur
        border border-white/15
        px-3 py-2
        shadow-sm
        transition-transform duration-200
        hover:scale-[1.02]
        active:scale-[0.99]
      "
            title={`${name} (${team})`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-white/80">
                    {slot} <span className="text-white/50">→</span> {usedRole}
                </div>
                <div className="text-[11px] text-white/70 tabular-nums">{Number.isInteger(score) ? score : score.toFixed(1)}</div>
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white truncate">{name}</div>
            <div className="text-[11px] text-white/75 truncate">{team}</div>
        </div>
    );
}

function errMsg(e: unknown) {
    return e instanceof Error ? e.message : "Errore";
}

function Pitch({ lineup, mode }: { lineup: LineupItem[]; mode: GameMode }) {

    const grouped = useMemo(() => {
        const g: Record<string, typeof lineup> = { ATT: [], AM: [], MID: [], WING: [], DEF: [], GK: [] };
        for (const x of lineup) {
            const k = getLineGroup(x.slot, mode);
            (g[k] ?? (g[k] = [])).push(x);
        }
        return [
            { key: "ATT", label: "Attacco", items: g.ATT },
            { key: "AM", label: "Trequarti", items: g.AM },
            { key: "MID", label: "Centrocampo", items: g.MID },
            { key: "DEF", label: "Difesa", items: g.DEF },
            { key: "GK", label: "Portiere", items: g.GK },
        ].filter((x) => x.items.length > 0);
    }, [lineup]);

    return (
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
            <div className="relative h-[560px] w-full bg-emerald-700">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-700 to-emerald-800 opacity-90" />
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:72px_72px]" />
                </div>

                <div className="absolute inset-6 rounded-2xl border-2 border-white/35" />
                <div className="absolute left-1/2 top-6 bottom-6 w-0 border-l-2 border-white/35" />
                <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />

                <div className="absolute left-1/2 top-6 h-20 w-56 -translate-x-1/2 border-2 border-white/35 rounded-b-2xl border-t-0" />
                <div className="absolute left-1/2 bottom-6 h-20 w-56 -translate-x-1/2 border-2 border-white/35 rounded-t-2xl border-b-0" />

                <div className="absolute inset-6 flex flex-col justify-between py-6">
                    {grouped.map((line) => {
                        const isMid = line.key === "MID";
                        const rowClass = ["flex items-center justify-center", "px-4 sm:px-6 gap-4 sm:gap-6", isMid ? "rotate-180" : ""].join(" ");

                        return (
                            <div key={line.key} className={rowClass}>
                                {line.items.map((x, idx) => (
                                    <div key={`${x.player.id}-${idx}-${x.slot}`} className={isMid ? "rotate-180" : ""}>
                                        <PlayerChip slot={x.slot} usedRole={x.usedRole} name={x.player.name} team={x.player.team} score={x.score} />
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">Campo · 11 titolari</div>
                    <div className="text-xs text-slate-500">Chip: Slot → Ruolo scelto · Score Top→Flop</div>
                </div>
            </div>
        </div>
    );
}

// --------------------
// ✅ Classifica a categorie (persistente + parsabile)
// --------------------
type CategoryKey = "scudetto" | "europa" | "tranquilla" | "salvezzaSoft" | "salvezzaHard";

const CATEGORIES: { key: CategoryKey; title: string; count: number }[] = [
    { key: "scudetto", title: "Lotta scudetto", count: 3 },
    { key: "europa", title: "Lotta Europa", count: 4 },
    { key: "tranquilla", title: "Zona tranquilla", count: 6 },
    { key: "salvezzaSoft", title: "Lotta salvezza soft", count: 4 },
    { key: "salvezzaHard", title: "Lotta salvezza hard", count: 3 },
];

function normTeamName(s: string) {
    return (s ?? "").trim();
}

type CatState = Record<CategoryKey, string[]>;

function emptyCatState(): CatState {
    return {
        scudetto: Array.from({ length: CATEGORIES.find((c) => c.key === "scudetto")!.count }, () => ""),
        europa: Array.from({ length: CATEGORIES.find((c) => c.key === "europa")!.count }, () => ""),
        tranquilla: Array.from({ length: CATEGORIES.find((c) => c.key === "tranquilla")!.count }, () => ""),
        salvezzaSoft: Array.from({ length: CATEGORIES.find((c) => c.key === "salvezzaSoft")!.count }, () => ""),
        salvezzaHard: Array.from({ length: CATEGORIES.find((c) => c.key === "salvezzaHard")!.count }, () => ""),
    };
}

function flattenAllSelected(state: CatState) {
    return Object.values(state).flat().map(normTeamName).filter(Boolean);
}

function buildPredictionTextFromCats(state: CatState) {
    const line = (label: string, arr: string[]) => `${label}: ${arr.map(normTeamName).filter(Boolean).join(", ")}`;

    return [
        line("SCUDETTO", state.scudetto),
        line("EUROPA", state.europa),
        line("TRANQUILLA", state.tranquilla),
        line("SALVEZZA_SOFT", state.salvezzaSoft),
        line("SALVEZZA_HARD", state.salvezzaHard),
    ].join("\n");
}

function parsePredictionToCats(text: string): CatState {
    const base = emptyCatState();
    const t = String(text ?? "");

    const getList = (label: string) => {
        const re = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "im");
        const m = t.match(re);
        if (!m || !m[1]) return [];
        return m[1]
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
    };

    const sc = getList("SCUDETTO");
    const eu = getList("EUROPA");
    const tr = getList("TRANQUILLA");
    const ss = getList("SALVEZZA_SOFT");
    const sh = getList("SALVEZZA_HARD");

    base.scudetto = [...sc.slice(0, base.scudetto.length), ...base.scudetto].slice(0, base.scudetto.length);
    base.europa = [...eu.slice(0, base.europa.length), ...base.europa].slice(0, base.europa.length);
    base.tranquilla = [...tr.slice(0, base.tranquilla.length), ...base.tranquilla].slice(0, base.tranquilla.length);
    base.salvezzaSoft = [...ss.slice(0, base.salvezzaSoft.length), ...base.salvezzaSoft].slice(0, base.salvezzaSoft.length);
    base.salvezzaHard = [...sh.slice(0, base.salvezzaHard.length), ...base.salvezzaHard].slice(0, base.salvezzaHard.length);

    return base;
}

export default function MeClient({
    email,
    teamName,
    players,
    initialPrediction,
    listoneTeams,
    initialGameMode,
}: {
    email: string;
    teamName: string;
    players: PlayerFromDB[];
    initialPrediction: string;
    listoneTeams: string[];
    initialGameMode?: GameMode;
}) {
    const [name, setName] = useState(teamName);
    const [saving, setSaving] = useState(false);

    const [mode, setMode] = useState<GameMode>(() => initialGameMode ?? "MANTRA");
    const [savingMode, setSavingMode] = useState(false);

    // (opzionale) riallinea il mode dal server se l'utente cambia device/sessione
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await fetch("/api/me/game-mode", { cache: "no-store" });
                if (!r.ok) return;
                const d = await r.json();
                const gm = String(d?.gameMode ?? "MANTRA").toUpperCase();
                if (!alive) return;
                if (gm === "MANTRA" || gm === "CLASSIC") setMode(gm as GameMode);
            } catch {
                // ignore
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    async function saveGameMode(next: GameMode) {
        if (next === mode) return;
        setSavingMode(true);
        try {
            const r = await fetch("/api/me/game-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameMode: next }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error ?? "Salvataggio fallito");

            const gm = String(d?.gameMode ?? next).toUpperCase();
            if (gm === "MANTRA" || gm === "CLASSIC") setMode(gm as GameMode);
            else setMode(next);

            toast.success("Modalità salvata");
        } catch (e: unknown) {
            toast.error(errMsg(e));
        } finally {
            setSavingMode(false);
        }
    }


    const [cats, setCats] = useState<CatState>(() => parsePredictionToCats(initialPrediction));
    const [predictionText, setPredictionText] = useState<string>(() =>
        buildPredictionTextFromCats(parsePredictionToCats(initialPrediction))
    );
    const [savingPrediction, setSavingPrediction] = useState(false);

    // squadre dal listone (uniche + ordinate)
    const teams = useMemo(() => {
        const cleaned = (listoneTeams ?? []).map(normTeamName).filter(Boolean);
        return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b, "it"));
    }, [listoneTeams]);

    // tutte le selezionate (in tutte le categorie)
    const selectedAll = useMemo(() => new Set(flattenAllSelected(cats)), [cats]);

    function optionsFor(category: CategoryKey, index: number) {
        const current = normTeamName(cats[category]?.[index] ?? "");
        return teams.filter((t) => {
            const nt = normTeamName(t);
            if (nt === current) return true;
            return !selectedAll.has(nt);
        });
    }

    function setTeamInCat(category: CategoryKey, index: number, value: string) {
        const v = normTeamName(value);

        setCats((prev) => {
            const next: CatState = {
                scudetto: [...prev.scudetto],
                europa: [...prev.europa],
                tranquilla: [...prev.tranquilla],
                salvezzaSoft: [...prev.salvezzaSoft],
                salvezzaHard: [...prev.salvezzaHard],
            };

            next[category][index] = v;

            // Safety: se duplicato, svuota tutte le altre occorrenze
            if (v) {
                (Object.keys(next) as CategoryKey[]).forEach((k) => {
                    next[k] = next[k].map((x, i) => {
                        if (k === category && i === index) return x;
                        return normTeamName(x) === v ? "" : x;
                    });
                });
            }

            return next;
        });
    }

    // Sync testo salvabile
    useEffect(() => {
        setPredictionText(buildPredictionTextFromCats(cats));
    }, [cats]);

    const moduleDefs = useMemo(() => (mode === "CLASSIC" ? CLASSIC_MODULE_DEFS : MODULES), [mode]);

    const [moduleName, setModuleName] = useState<string>(
        moduleDefs[0]?.name ?? (mode === "CLASSIC" ? "4-4-2" : "3-4-1-2")
    );

    useEffect(() => {
        if (!moduleDefs.some((m) => m.name === moduleName)) {
            setModuleName(moduleDefs[0]?.name ?? moduleName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const { scoreByRole } = useMemo(() => computeTopFlopScoresByRole(players, mode), [players, mode]);
    const moduleDef = useMemo(
        () => moduleDefs.find((m) => m.name === moduleName) ?? moduleDefs[0],
        [moduleDefs, moduleName]
    );

    const ideal = useMemo(() => {
        if (!moduleDef) return { selectable: false, lineup: [] };
        return pickBestLineup(players, scoreByRole, moduleDef, mode);
    }, [players, scoreByRole, moduleDef, mode]);

    async function saveTeamName() {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Inserisci un nome squadra");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/team/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Salvataggio fallito");

            toast.success("Nome squadra salvato");
        } catch (e: unknown) {
            toast.error(errMsg(e) ?? "Errore salvataggio");
        } finally {
            setSaving(false);
        }
    }

    async function savePrediction() {
        const chosen = flattenAllSelected(cats);
        const unique = new Set(chosen);

        if (chosen.length !== 20) {
            toast.error("Completa tutte le scelte: devono essere 20 squadre totali.");
            return;
        }
        if (unique.size !== 20) {
            toast.error("Ci sono squadre duplicate tra le categorie.");
            return;
        }

        const text = buildPredictionTextFromCats(cats).trim();
        if (!text) {
            toast.error("Inserisci la classifica teorica");
            return;
        }

        setSavingPrediction(true);
        try {
            const res = await fetch("/api/me/prediction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Salvataggio fallito");

            toast.success("Classifica salvata");
        } catch (e: unknown) {
            toast.error(errMsg(e) ?? "Errore salvataggio");
        } finally {
            setSavingPrediction(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Profilo</h1>
                    <p className="mt-1 text-sm text-slate-600">Loggato come: {email}</p>
                </div>

                <Link href="/team" className="text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4">
                    Vai al Team →
                </Link>
            </div>


            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Modalità di gioco</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                        Seleziona <b>Mantra</b> o <b>Classic</b>. La scelta viene salvata sul tuo profilo e usata per ruoli/moduli.
                    </div>
                    <Separator />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={mode === "MANTRA" ? "default" : "outline"}
                            className="rounded-xl"
                            disabled={savingMode}
                            onClick={() => saveGameMode("MANTRA")}
                        >
                            Mantra
                        </Button>
                        <Button
                            type="button"
                            variant={mode === "CLASSIC" ? "default" : "outline"}
                            className="rounded-xl"
                            disabled={savingMode}
                            onClick={() => saveGameMode("CLASSIC")}
                        >
                            Classic
                        </Button>

                        {savingMode ? (
                            <span className="text-sm text-slate-500 self-center ml-2">Salvo…</span>
                        ) : null}
                    </div>
                </CardContent>
            </Card>


            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Nome squadra</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">Scegli o modifica il nome della tua squadra.</div>
                    <Separator />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. FC Raffy" className="rounded-xl" maxLength={40} />
                        <Button onClick={saveTeamName} disabled={saving} className="rounded-xl active:scale-[0.99]">
                            {saving ? "Salvo..." : "Salva"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ✅ Classifica a categorie */}
            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Classifica teorica per categorie</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Seleziona le squadre del listone (CSV) nelle 5 categorie. Una squadra scelta sparisce da tutte le altre select.
                    </div>

                    <Separator />

                    {teams.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Non trovo squadre nel listone. Controlla import CSV e campo <b>team</b> sul Player.
                        </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                        {CATEGORIES.map((cat) => (
                            <div key={cat.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-base font-semibold text-slate-900">{cat.title}</div>
                                    <div className="text-xs text-slate-500">{cat.count} squadre</div>
                                </div>

                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {cats[cat.key].map((val, idx) => {
                                        const opts = optionsFor(cat.key, idx);
                                        return (
                                            <div key={`${cat.key}-${idx}`} className="rounded-xl border border-slate-200 p-3">
                                                <div className="text-sm font-semibold text-slate-800">{idx + 1}ª scelta</div>
                                                <select
                                                    value={val}
                                                    onChange={(e) => setTeamInCat(cat.key, idx, e.target.value)}
                                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                                >
                                                    <option value="">— seleziona —</option>
                                                    {opts.map((t) => (
                                                        <option key={t} value={t}>
                                                            {t}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="mt-1 text-xs text-slate-500">Disponibili: {opts.length}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-1">
                        <div className="text-xs text-slate-500 mb-2">Formato salvato (parsabile):</div>
                        <textarea
                            value={predictionText}
                            readOnly
                            className="min-h-[150px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => {
                                setCats(emptyCatState());
                            }}
                        >
                            Reset
                        </Button>

                        <Button onClick={savePrediction} disabled={savingPrediction} className="rounded-xl active:scale-[0.99]">
                            {savingPrediction ? "Salvo..." : "Salva classifica"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Formazione ideale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Scegli un modulo: selezioniamo automaticamente gli 11 migliori usando la logica “Top→Flop” per ruolo.
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-medium text-slate-700">Modulo</div>
                        <select
                            value={moduleName}
                            onChange={(e) => setModuleName(e.target.value)}
                            className="w-full sm:w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                            {moduleDefs.map((m) => (
                                <option key={m.name} value={m.name}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!ideal.selectable ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                            <b>MODULO NON SELEZIONABILE</b>: manca almeno un ruolo necessario (o non hai abbastanza giocatori disponibili).
                        </div>
                    ) : (
                        <Pitch lineup={ideal.lineup} mode={mode} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
