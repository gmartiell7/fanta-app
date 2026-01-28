import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Player svincolato dal CSV
 */
type IncomingPlayer = {
    extId: number;        // "#" del CSV svincolati (== Player.extId)
    name: string;
    team?: string;
    roleMantra: string;
    pg: number | null;    // PGv
    mv: number | null;    // MV
    fm: number | null;    // FM
};

const MANTRA_ROLES = ["Por", "Dc", "Dd", "Ds", "E", "M", "C", "W", "T", "A", "Pc"];

function splitRoles(roleMantra?: string | null) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
function hasRole(roleMantra: string, base: string) {
    return splitRoles(roleMantra).includes(base);
}

// 🔴 IDENTICA a quella che usi in team/players
function calcFmv(s: {
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
}) {
    if (s.vote === null) return null;
    return (
        s.vote +
        s.gf * 3 -
        s.gs * 1 +
        s.rp * 3 +
        s.rs * 3 -
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

/** ultimo=0 poi +1 risalendo */
function assignRankPoints<T>(
    items: T[],
    getValue: (x: T) => number,
    getKey: (x: T) => string
) {
    const sorted = [...items].sort((a, b) => getValue(a) - getValue(b));
    const pts = new Map<string, number>();
    for (let i = 0; i < sorted.length; i++) pts.set(getKey(sorted[i]), i);
    return pts;
}

/** duelli cumulativi */
function computeDuels(
    ids: string[],
    matchdays: number[],
    getVal: (id: string, g: number) => number | null
) {
    const wins = new Map<string, number>();
    ids.forEach((id) => wins.set(id, 0));

    for (const g of matchdays) {
        const vals = ids.map((id) => ({ id, v: getVal(id, g) ?? 0 }));
        for (let i = 0; i < vals.length; i++) {
            for (let j = 0; j < vals.length; j++) {
                if (i !== j && vals[i].v > vals[j].v) {
                    wins.set(vals[i].id, (wins.get(vals[i].id) ?? 0) + 1);
                }
            }
        }
    }
    return wins;
}

function bonusLast5(matchdays: number[], getVote: (g: number) => number | null) {
    const last5 = matchdays.slice(-5);
    if (last5.length < 5) return 1;
    for (const g of last5) {
        const v = getVote(g);
        if (v === null || v <= 6.5) return 1;
    }
    return 1.5;
}

export async function POST(req: Request) {
    const body = await req.json();
    const players: IncomingPlayer[] = body.players ?? [];
    const selectedExtId: number | null =
        Number.isFinite(body.selectedExtId) ? body.selectedExtId : null;

    if (!players.length) {
        return NextResponse.json({ byRole: {}, matchdays: [] });
    }

    // extId -> Player.id
    const extIds = Array.from(
        new Set([
            ...players.map((p) => p.extId),
            ...(selectedExtId ? [selectedExtId] : []),
        ])
    );

    const dbPlayers = await prisma.player.findMany({
        where: { extId: { in: extIds } },
        select: { id: true, extId: true, name: true, roleMantra: true, team: true },
    });

    const byExtId = new Map<number, typeof dbPlayers[0]>();
    dbPlayers.forEach((p) => byExtId.set(p.extId, p));

    const dbIds = dbPlayers.map((p) => p.id);

    const stats = await prisma.matchdayStat.findMany({
        where: { playerId: { in: dbIds } },
    });

    const matchdays = Array.from(new Set(stats.map((s) => s.matchday))).sort(
        (a, b) => a - b
    );

    const voteMap = new Map<string, Map<number, number | null>>();
    const fmvMap = new Map<string, Map<number, number | null>>();
    dbIds.forEach((id) => {
        voteMap.set(id, new Map());
        fmvMap.set(id, new Map());
    });

    stats.forEach((s) => {
        voteMap.get(s.playerId)?.set(s.matchday, s.vote ?? null);
        fmvMap
            .get(s.playerId)
            ?.set(s.matchday, calcFmv(s as any));
    });

    // aggiungo eventuale giocatore selezionato
    const enriched = players
        .map((p) => {
            const db = byExtId.get(p.extId);
            if (!db) return null;
            return { ...p, dbId: db.id, isMe: false };
        })
        .filter(Boolean) as any[];

    if (selectedExtId) {
        const sel = byExtId.get(selectedExtId);
        if (sel && !enriched.some((p) => p.extId === selectedExtId)) {
            const votes = voteMap.get(sel.id) ?? new Map();
            const fmvs = fmvMap.get(sel.id) ?? new Map();
            const mvArr = matchdays.map((g) => votes.get(g)).filter((x) => x != null);
            const fmArr = matchdays.map((g) => fmvs.get(g)).filter((x) => x != null);

            enriched.push({
                extId: sel.extId,
                name: sel.name,
                team: sel.team,
                roleMantra: sel.roleMantra,
                pg: mvArr.length,
                mv: mvArr.length ? mvArr.reduce((a, b) => a + b, 0) / mvArr.length : null,
                fm: fmArr.length ? fmArr.reduce((a, b) => a + b, 0) / fmArr.length : null,
                dbId: sel.id,
                isMe: true,
            });
        }
    }

    const byRole: Record<string, any[]> = {};
    MANTRA_ROLES.forEach((r) => (byRole[r] = []));

    enriched.forEach((p) => {
        MANTRA_ROLES.forEach((r) => {
            if (hasRole(p.roleMantra, r)) byRole[r].push(p);
        });
    });

    for (const role of MANTRA_ROLES) {
        const list = byRole[role];
        if (!list.length) continue;

        const mvPts = assignRankPoints(list, (x) => x.mv ?? -9999, (x) => x.dbId);
        const fmPts = assignRankPoints(list, (x) => x.fm ?? -9999, (x) => x.dbId);

        const ids = list.map((x) => x.dbId);
        const duelMvRaw = computeDuels(ids, matchdays, (id, g) => voteMap.get(id)?.get(g) ?? null);
        const duelFmvRaw = computeDuels(ids, matchdays, (id, g) => fmvMap.get(id)?.get(g) ?? null);

        const duelMvPts = assignRankPoints(list, (x) => duelMvRaw.get(x.dbId) ?? 0, (x) => x.dbId);
        const duelFmvPts = assignRankPoints(list, (x) => duelFmvRaw.get(x.dbId) ?? 0, (x) => x.dbId);

        byRole[role] = list
            .map((p) => {
                const votes = voteMap.get(p.dbId) ?? new Map();
                const bonus = bonusLast5(matchdays, (g) => votes.get(g) ?? null);

                const total =
                    (mvPts.get(p.dbId)! +
                        fmPts.get(p.dbId)! +
                        duelMvPts.get(p.dbId)! +
                        duelFmvPts.get(p.dbId)!) *
                    bonus;

                return {
                    ...p,
                    pt_mv_rank: mvPts.get(p.dbId),
                    pt_fm_rank: fmPts.get(p.dbId),
                    pt_duel_mv: duelMvPts.get(p.dbId),
                    pt_duel_fmv: duelFmvPts.get(p.dbId),
                    total,
                };
            })
            .sort((a, b) => b.total - a.total);
    }

    return NextResponse.json({ byRole, matchdays });
}
