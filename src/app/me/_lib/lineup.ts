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

type ScoreItems = { row: Row; roles: string[] };

function keyForRoleGroup(roles: string[]) {
    return [...new Set(roles.map(normRole))].filter(Boolean).sort().join("|");
}

function playerMatchesAnyRole(playerRoles: string[], allowed: string[]) {
    const set = new Set(playerRoles.map(normRole));
    return allowed.some((r) => set.has(normRole(r)));
}

function computeScoreForRoleGroup(items: ScoreItems[], allowedRoles: string[], totalMatchdays: number) {
    const pool = items
        .filter((it) => playerMatchesAnyRole(it.roles, allowedRoles))
        .map((it) => it.row);

    if (pool.length === 0) return new Map<string, number>();

    const duelVote = computeDuelTotals(pool, totalMatchdays, (r, day) => r.voteByDay[day] ?? 0);
    const duelFmv = computeDuelTotals(pool, totalMatchdays, (r, day) => r.fmvByDay[day] ?? 0);

    const mvPtById = computeRankPtMap(pool, (r) => r.mv);
    const fmvPtById = computeRankPtMap(pool, (r) => r.fmv);
    const duelVotePtById = computeRankPtMapFromScored(duelVote);
    const duelFmvPtById = computeRankPtMapFromScored(duelFmv);

    const byId = new Map<string, number>();
    for (const r of pool) {
        const base =
            (mvPtById.get(r.id) ?? 0) +
            (fmvPtById.get(r.id) ?? 0) +
            (duelVotePtById.get(r.id) ?? 0) +
            (duelFmvPtById.get(r.id) ?? 0);

        const bonus = hasBonusLast5(r, totalMatchdays);
        byId.set(r.id, bonus ? base * 1.5 : base);
    }

    return byId;
}

export function computeTopFlopScoresByRole(players: PlayerFromDB[], mode: GameMode) {
    const items: ScoreItems[] = players.map((p) => {
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
            byId.set(r.id, bonus ? base * 1.5 : base);
        }

        scoreByRole.set(role, byId);
    }

    return { scoreByRole, totalMatchdays, items };
}

export type LineupItem = {
    slot: string;
    slotIndex: number; // ✅ identifica lo “slot duplicato” (es: A/Pc #9 e A/Pc #10)
    player: PlayerFromDB;
    usedRole: string;
    score: number;
};

export type PickBestLineupResult =
    | { selectable: true; lineup: LineupItem[] }
    | { selectable: false; lineup: LineupItem[] };

function pickPreferredRole(compat: string[], mode: GameMode) {
    if (compat.length === 0) return "";
    let usedRole = compat[0];
    if (compat.length > 1 && mode === "MANTRA") {
        const preferOrder = ["Pc", "A", "T", "W", "C", "M", "E", "Dc", "Dd", "Ds", "Por"];
        for (const pref of preferOrder) {
            if (compat.includes(pref)) {
                usedRole = pref;
                break;
            }
        }
    }
    return usedRole;
}

function buildScoreResolver(
    players: PlayerFromDB[],
    scoreByRole: Map<string, Map<string, number>>,
    mode: GameMode,
    extra?: { items: ScoreItems[]; totalMatchdays: number }
) {
    const playerRoles = new Map<string, string[]>();
    for (const p of players) playerRoles.set(p.id, splitRoles(roleStringForMode(p, mode)).map(normRole));

    const groupScoreCache = new Map<string, Map<string, number>>();

    function getScoreMapForSlot(allowedRolesRaw: string[]) {
        const allowed = [...new Set(allowedRolesRaw.map(normRole))].filter(Boolean);

        if (allowed.length === 1) return scoreByRole.get(allowed[0]) ?? new Map<string, number>();

        const k = keyForRoleGroup(allowed);
        const cached = groupScoreCache.get(k);
        if (cached) return cached;

        const computed = extra ? computeScoreForRoleGroup(extra.items, allowed, extra.totalMatchdays) : new Map<string, number>();
        groupScoreCache.set(k, computed);
        return computed;
    }

    function getCompatibleRoles(p: PlayerFromDB, allowedRolesRaw: string[]) {
        const roles = playerRoles.get(p.id) ?? [];
        const allowed = allowedRolesRaw.map(normRole);
        return allowed.filter((r) => roles.includes(r));
    }

    return { playerRoles, getScoreMapForSlot, getCompatibleRoles };
}

export function pickBestLineup(
    players: PlayerFromDB[],
    scoreByRole: Map<string, Map<string, number>>,
    module: ModuleDef,
    mode: GameMode,
    extra?: { items: ScoreItems[]; totalMatchdays: number }
): PickBestLineupResult {
    const { getScoreMapForSlot, getCompatibleRoles } = buildScoreResolver(players, scoreByRole, mode, extra);

    // selezionabilità
    for (const slot of module.slots) {
        const allowedRoles = expandRoleToken(slot);
        const scoreMap = getScoreMapForSlot(allowedRoles);
        if (scoreMap.size === 0) return { selectable: false, lineup: [] };
    }

    const used = new Set<string>();
    const lineup: LineupItem[] = [];

    for (let slotIndex = 0; slotIndex < module.slots.length; slotIndex++) {
        const slot = module.slots[slotIndex];
        const allowedRoles = expandRoleToken(slot);
        const scoreMap = getScoreMapForSlot(allowedRoles);

        let best: { p: PlayerFromDB; usedRole: string; score: number } | null = null;

        for (const p of players) {
            if (used.has(p.id)) continue;

            const compat = getCompatibleRoles(p, allowedRoles);
            if (compat.length === 0) continue;

            const sc = scoreMap.get(p.id);
            if (sc === undefined) continue;

            const usedRole = pickPreferredRole(compat, mode);
            if (!best || sc > best.score) best = { p, usedRole, score: sc };
        }

        if (!best) return { selectable: false, lineup: [] };

        used.add(best.p.id);
        lineup.push({ slot, slotIndex, player: best.p, usedRole: best.usedRole, score: best.score });
    }

    return { selectable: true as const, lineup };
}

/**
 * WHAT-IF: forza un giocatore in uno specifico slotIndex del modulo,
 * poi completa gli altri slot con la stessa logica greedy.
 */
export function pickBestLineupWhatIf(
    players: PlayerFromDB[],
    scoreByRole: Map<string, Map<string, number>>,
    module: ModuleDef,
    mode: GameMode,
    lock: { slotIndex: number; playerId: string },
    extra?: { items: ScoreItems[]; totalMatchdays: number }
): PickBestLineupResult {
    const { getScoreMapForSlot, getCompatibleRoles } = buildScoreResolver(players, scoreByRole, mode, extra);

    // selezionabilità: ogni slot deve avere candidati
    for (const slot of module.slots) {
        const allowedRoles = expandRoleToken(slot);
        const scoreMap = getScoreMapForSlot(allowedRoles);
        if (scoreMap.size === 0) return { selectable: false, lineup: [] };
    }

    const used = new Set<string>();
    const lineup: LineupItem[] = [];

    for (let slotIndex = 0; slotIndex < module.slots.length; slotIndex++) {
        const slot = module.slots[slotIndex];
        const allowedRoles = expandRoleToken(slot);
        const scoreMap = getScoreMapForSlot(allowedRoles);

        // slot “bloccato”
        if (slotIndex === lock.slotIndex) {
            const forced = players.find((p) => p.id === lock.playerId);
            if (!forced) return { selectable: false, lineup: [] };
            if (used.has(forced.id)) return { selectable: false, lineup: [] };

            const compat = getCompatibleRoles(forced, allowedRoles);
            if (compat.length === 0) return { selectable: false, lineup: [] };

            const sc = scoreMap.get(forced.id);
            if (sc === undefined) return { selectable: false, lineup: [] };

            const usedRole = pickPreferredRole(compat, mode);
            used.add(forced.id);
            lineup.push({ slot, slotIndex, player: forced, usedRole, score: sc });
            continue;
        }

        let best: { p: PlayerFromDB; usedRole: string; score: number } | null = null;

        for (const p of players) {
            if (used.has(p.id)) continue;

            const compat = getCompatibleRoles(p, allowedRoles);
            if (compat.length === 0) continue;

            const sc = scoreMap.get(p.id);
            if (sc === undefined) continue;

            const usedRole = pickPreferredRole(compat, mode);
            if (!best || sc > best.score) best = { p, usedRole, score: sc };
        }

        if (!best) return { selectable: false, lineup: [] };

        used.add(best.p.id);
        lineup.push({ slot, slotIndex, player: best.p, usedRole: best.usedRole, score: best.score });
    }

    return { selectable: true as const, lineup };
}

export type SlotRankingRow = {
    player: PlayerFromDB;
    score: number;
    matchedRoles: string[];
};

export function getSlotRanking(
    players: PlayerFromDB[],
    scoreByRole: Map<string, Map<string, number>>,
    slot: string,
    mode: GameMode,
    extra?: { items: ScoreItems[]; totalMatchdays: number }
): SlotRankingRow[] {
    const allowedRoles = expandRoleToken(slot).map(normRole).filter(Boolean);
    const allowedUnique = [...new Set(allowedRoles)];

    const { getScoreMapForSlot } = buildScoreResolver(players, scoreByRole, mode, extra);
    const scoreMap = getScoreMapForSlot(allowedUnique);

    const playerRoles = new Map<string, string[]>();
    for (const p of players) playerRoles.set(p.id, splitRoles(roleStringForMode(p, mode)).map(normRole));

    const rows: SlotRankingRow[] = [];
    for (const p of players) {
        const roles = playerRoles.get(p.id) ?? [];
        const matched = allowedUnique.filter((r) => roles.includes(r));
        if (matched.length === 0) continue;

        const sc = scoreMap.get(p.id);
        if (sc === undefined) continue;

        rows.push({ player: p, score: sc, matchedRoles: matched });
    }

    rows.sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name));
    return rows;
}

export function getLineGroup(slot: string, mode: GameMode) {
    const roles = expandRoleToken(slot).map(normRole);
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
    if (has("A") || has("Pc")) return "ATT";
    return "MID";
}
