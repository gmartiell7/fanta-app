import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcFmvMeClient } from "@/lib/fantaConfig";

type GameMode = "MANTRA" | "CLASSIC";

/**
 * Player svincolato dal CSV (o costruito lato client)
 * NB: in Classic il client dovrebbe mandare roleClassic; in Mantra roleMantra.
 */
type IncomingPlayer = {
    extId: number; // "#" del CSV svincolati (== Player.extId)
    name: string;
    team?: string;

    roleMantra?: string | null;
    roleClassic?: string | null;

    pg: number | null; // PGv
    mv: number | null; // MV
    fm: number | null; // FM
};

const MANTRA_ROLES = ["Por", "Dc", "Dd", "Ds", "E", "M", "C", "W", "T", "A", "Pc"] as const;
const CLASSIC_ROLES = ["P", "D", "C", "A"] as const;

function splitMulti(s?: string | null) {
    return String(s ?? "")
        .split(/[\/;]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function hasRoleForMode(mode: GameMode, p: { roleMantra?: string | null; roleClassic?: string | null }, base: string) {
    if (mode === "CLASSIC") return splitMulti(p.roleClassic).includes(base);
    return splitMulti(p.roleMantra).includes(base);
}

// ✅ IDENTICA (coerente) alla formula che usi in MeClient/team
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
        s.rp * 3 -
        s.rs * 3 +
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

/** ultimo=0 poi +1 risalendo (come avevi tu: min->max) */
function assignRankPoints<T>(items: T[], getValue: (x: T) => number, getKey: (x: T) => string) {
    const sorted = [...items].sort((a, b) => getValue(a) - getValue(b));
    const pts = new Map<string, number>();
    for (let i = 0; i < sorted.length; i++) pts.set(getKey(sorted[i]), i);
    return pts;
}

/** duelli cumulativi */
function computeDuels(ids: string[], matchdays: number[], getVal: (id: string, g: number) => number | null) {
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

    const mode: GameMode = String(body?.gameMode ?? "MANTRA").toUpperCase() === "CLASSIC" ? "CLASSIC" : "MANTRA";

    const players: IncomingPlayer[] = Array.isArray(body?.players) ? body.players : [];
    const selectedExtId: number | null = Number.isFinite(body?.selectedExtId) ? body.selectedExtId : null;

    if (!players.length && !selectedExtId) {
        return NextResponse.json({ byRole: {}, matchdays: [] });
    }

    // extId -> Player.id
    const extIds = Array.from(
        new Set([
            ...players.map((p) => Number(p.extId)).filter((x) => Number.isFinite(x)),
            ...(selectedExtId ? [selectedExtId] : []),
        ])
    );

    if (!extIds.length) {
        return NextResponse.json({ byRole: {}, matchdays: [] });
    }

    const dbPlayers = await prisma.player.findMany({
        where: { extId: { in: extIds } },
        select: {
            id: true,
            extId: true,
            name: true,
            team: true,
            roleMantra: true,
            roleClassic: true,
        },
    });

    const byExtId = new Map<number, (typeof dbPlayers)[number]>();
    dbPlayers.forEach((p) => byExtId.set(p.extId, p));

    const dbIds = dbPlayers.map((p) => p.id);

    const stats = await prisma.matchdayStat.findMany({
        where: { playerId: { in: dbIds } },
        select: {
            playerId: true,
            matchday: true,
            vote: true,
            gf: true,
            gs: true,
            rp: true,
            rs: true,
            rf: true,
            au: true,
            amm: true,
            esp: true,
            ass: true,
        },
    });

    const matchdays = Array.from(new Set(stats.map((s) => s.matchday))).sort((a, b) => a - b);

    // playerId -> (matchday -> vote/fmv)
    const voteMap = new Map<string, Map<number, number | null>>();
    const fmvMap = new Map<string, Map<number, number | null>>();

    for (const id of dbIds) {
        voteMap.set(id, new Map());
        fmvMap.set(id, new Map());
    }

    for (const s of stats) {
        const vote = s.vote ?? null;

        const fmv = calcFmvMeClient({
            vote,
            gf: s.gf,
            gs: s.gs,
            rp: s.rp,
            rs: s.rs,
            rf: s.rf,
            au: s.au,
            amm: s.amm,
            esp: s.esp,
            ass: s.ass,
        });

        voteMap.get(s.playerId)?.set(s.matchday, vote);
        fmvMap.get(s.playerId)?.set(s.matchday, fmv);
    }

    // ✅ Arricchisco i players del CSV con dbId + ruoli dal DB (se mancanti)
    const enriched = players
        .map((p) => {
            const db = byExtId.get(Number(p.extId));
            if (!db) return null;

            return {
                extId: Number(p.extId),
                name: String(p.name ?? db.name ?? ""),
                team: String(p.team ?? db.team ?? ""),

                roleMantra: p.roleMantra ?? db.roleMantra ?? null,
                roleClassic: p.roleClassic ?? db.roleClassic ?? null,

                pg: p.pg ?? null,
                mv: p.mv ?? null,
                fm: p.fm ?? null,

                dbId: db.id,
                isMe: false,
            };
        })
        .filter((x): x is NonNullable<typeof x> => !!x);

    // ✅ Aggiungo eventuale giocatore selezionato (da DB)
    if (selectedExtId) {
        const sel = byExtId.get(selectedExtId);
        const alreadyIn = enriched.some((p) => p.extId === selectedExtId);

        if (sel && !alreadyIn) {
            const votes = voteMap.get(sel.id) ?? new Map();
            const fmvs = fmvMap.get(sel.id) ?? new Map();

            const mvArr = matchdays.map((g) => votes.get(g)).filter((x): x is number => x != null);
            const fmArr = matchdays.map((g) => fmvs.get(g)).filter((x): x is number => x != null);

            enriched.push({
                extId: sel.extId,
                name: sel.name,
                team: sel.team,

                roleMantra: sel.roleMantra ?? null,
                roleClassic: sel.roleClassic ?? null,

                pg: mvArr.length,
                mv: mvArr.length ? mvArr.reduce((a, b) => a + b, 0) / mvArr.length : null,
                fm: fmArr.length ? fmArr.reduce((a, b) => a + b, 0) / fmArr.length : null,

                dbId: sel.id,
                isMe: true,
            });
        }
    }

    // ✅ In Classic: se un player non ha roleClassic, non ha senso tenerlo
    const filteredEnriched =
        mode === "CLASSIC"
            ? enriched.filter((p) => String(p.roleClassic ?? "").trim().length > 0)
            : enriched.filter((p) => String(p.roleMantra ?? "").trim().length > 0);

    const roles = mode === "CLASSIC" ? CLASSIC_ROLES : MANTRA_ROLES;

    const byRole: Record<string, typeof filteredEnriched[number][]> = {};
    roles.forEach((r) => (byRole[r] = []));

    for (const p of filteredEnriched) {
        for (const r of roles) {
            if (hasRoleForMode(mode, p, r)) byRole[r].push(p);
        }
    }

    // calcolo punteggi per ruolo
    const out: Record<string, any[]> = {};
    roles.forEach((r) => (out[r] = []));

    for (const role of roles) {
        const list = byRole[role];
        if (!list.length) continue;

        const mvPts = assignRankPoints(list, (x) => x.mv ?? -9999, (x) => x.dbId);
        const fmPts = assignRankPoints(list, (x) => x.fm ?? -9999, (x) => x.dbId);

        const ids = list.map((x) => x.dbId);

        const duelMvRaw = computeDuels(ids, matchdays, (id, g) => voteMap.get(id)?.get(g) ?? null);
        const duelFmvRaw = computeDuels(ids, matchdays, (id, g) => fmvMap.get(id)?.get(g) ?? null);

        const duelMvPts = assignRankPoints(list, (x) => duelMvRaw.get(x.dbId) ?? 0, (x) => x.dbId);
        const duelFmvPts = assignRankPoints(list, (x) => duelFmvRaw.get(x.dbId) ?? 0, (x) => x.dbId);

        out[role] = list
            .map((p) => {
                const votes = voteMap.get(p.dbId) ?? new Map();
                const bonus = bonusLast5(matchdays, (g) => votes.get(g) ?? null);

                const total =
                    ((mvPts.get(p.dbId) ?? 0) +
                        (fmPts.get(p.dbId) ?? 0) +
                        (duelMvPts.get(p.dbId) ?? 0) +
                        (duelFmvPts.get(p.dbId) ?? 0)) *
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
            .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0));
    }

    return NextResponse.json({ byRole: out, matchdays });
}
