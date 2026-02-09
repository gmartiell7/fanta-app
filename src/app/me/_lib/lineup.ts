import type { GameMode, PlayerFromDB, StatRow } from "./types";
import { calcFmvFromStats, calcFmvMatch, calcMvFromStats } from "./stats";

export type ModuleDef = { name: string; slots: string[] };

export const MODULES: ModuleDef[] = [
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

export const CLASSIC_MODULE_DEFS: ModuleDef[] = [
    { name: "3-4-3", slots: ["P", "D", "D", "D", "C", "C", "C", "C", "A", "A", "A"] },
    { name: "3-5-2", slots: ["P", "D", "D", "D", "C", "C", "C", "C", "C", "A", "A"] },
    { name: "4-3-3", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "A", "A", "A"] },
    { name: "4-4-2", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "C", "A", "A"] },
    { name: "4-5-1", slots: ["P", "D", "D", "D", "D", "C", "C", "C", "C", "C", "A"] },
    { name: "5-3-2", slots: ["P", "D", "D", "D", "D", "D", "C", "C", "C", "A", "A"] },
    { name: "5-4-1", slots: ["P", "D", "D", "D", "D", "D", "C", "C", "C", "C", "A"] },
];

function splitRoles(role?: string | null) {
    return String(role ?? "")
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

    const scored = rows.map((r) => ({ id: r.id, pts: totals.get(r.id) ?? 0 }));
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

export function computeTopFlopScoresByRole(players: PlayerFromDB[], mode: GameMode) {
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

export type LineupItem = {
    slot: string;
    player: PlayerFromDB;
    usedRole: string;
    score: number;
};

export type PickBestLineupResult =
    | { selectable: true; lineup: LineupItem[] }
    | { selectable: false; lineup: LineupItem[] };

export function pickBestLineup(
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
    const lineup: LineupItem[] = [];

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

export function getLineGroup(slot: string, mode: GameMode) {
    const roles = expandRoleToken(slot).map(normRole); // ✅ normalizza sicuro
    const has = (r: string) => roles.includes(normRole(r));

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
    if (has("A") || has("Pc") || has("PC")) return "ATT"; // ✅ include Pc anche in varianti
    return "MID";
}
