import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

async function getOrCreateTeam(userId: string) {
    let team = await prisma.team.findUnique({ where: { ownerId: userId } });
    if (!team) {
        team = await prisma.team.create({
            data: { ownerId: userId, name: "Senza nome" },
        });
    }
    return team;
}

function calcFmvFromStat(s: {
    vote: number;
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
    return (
        s.vote +
        s.gf * 3 -
        s.gs * 1 +
        s.rp * 3 -
        s.rs * 1 -
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

/**
 * Carica la rosa e calcola:
 * - pg: count MatchdayStat validi (vote != null e voteRaw != "6*")
 * - mv: media vote
 * - fmv: media formula
 */
async function loadRosterWithComputed(teamId: string) {
    const roster = await prisma.teamPlayer.findMany({
        where: { teamId },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            player: {
                select: {
                    id: true, // <-- serve per agganciare MatchdayStat
                    extId: true,
                    name: true,
                    team: true,
                    roleMantra: true,
                    roleClassic: true,
                    price: true,
                },
            },
        },
    });

    const playerIds = roster.map((r) => r.player.id);
    if (playerIds.length === 0) return roster;

    // prendo TUTTE le stats dei player in rosa con voto valido
    const stats = await prisma.matchdayStat.findMany({
        where: {
            playerId: { in: playerIds },
            vote: { not: null },
            NOT: { voteRaw: "6*" }, // escludo i 6*
        },
        select: {
            playerId: true,
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

    // aggrego per playerId
    const agg = new Map<
        string,
        { pg: number; sumVote: number; sumFmv: number }
    >();

    for (const s of stats) {
        const vote = s.vote;
        if (vote == null) continue;

        const fmv = calcFmvFromStat({
            vote,
            gf: s.gf ?? 0,
            gs: s.gs ?? 0,
            rp: s.rp ?? 0,
            rs: s.rs ?? 0,
            rf: s.rf ?? 0,
            au: s.au ?? 0,
            amm: s.amm ?? 0,
            esp: s.esp ?? 0,
            ass: s.ass ?? 0,
        });

        const cur = agg.get(s.playerId) ?? { pg: 0, sumVote: 0, sumFmv: 0 };
        cur.pg += 1;
        cur.sumVote += vote;
        cur.sumFmv += fmv;
        agg.set(s.playerId, cur);
    }

    // merge dentro player: pg/mv/fmv
    return roster.map((r) => {
        const a = agg.get(r.player.id);
        const pg = a?.pg ?? 0;
        const mv = pg > 0 ? a!.sumVote / pg : null;
        const fmv = pg > 0 ? a!.sumFmv / pg : null;

        return {
            ...r,
            player: {
                ...r.player,
                pg,
                mv,
                fmv,
            },
        };
    });
}

export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user?.id) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const team = await getOrCreateTeam(user.id);
    const roster = await loadRosterWithComputed(team.id);

    return NextResponse.json({ team, roster });
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user?.id) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { playerExtId?: number } | null;
    const playerExtId = Number(body?.playerExtId);
    if (!Number.isFinite(playerExtId)) {
        return NextResponse.json({ error: "playerExtId non valido" }, { status: 400 });
    }

    const team = await getOrCreateTeam(user.id);

    // portiere max 3
    const player = await prisma.player.findUnique({
        where: { extId: playerExtId },
        select: { extId: true, roleMantra: true },
    });
    if (!player) return NextResponse.json({ error: "Giocatore non trovato" }, { status: 404 });

    const isPor = player.roleMantra.toLowerCase().includes("por");
    if (isPor) {
        const porCount = await prisma.teamPlayer.count({
            where: {
                teamId: team.id,
                player: { roleMantra: { contains: "Por", mode: "insensitive" } },
            },
        });
        if (porCount >= 3) {
            return NextResponse.json({ error: "Max 3 portieri" }, { status: 400 });
        }
    }

    // create (se già presente -> ignoro)
    try {
        await prisma.teamPlayer.create({
            data: { teamId: team.id, playerExtId },
        });
    } catch {
        // già in rosa
    }

    const roster = await loadRosterWithComputed(team.id);
    return NextResponse.json({ team, roster });
}

export async function DELETE(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!user?.id) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { playerExtId?: number } | null;
    const playerExtId = Number(body?.playerExtId);
    if (!Number.isFinite(playerExtId)) {
        return NextResponse.json({ error: "playerExtId non valido" }, { status: 400 });
    }

    const team = await getOrCreateTeam(user.id);

    await prisma.teamPlayer.deleteMany({
        where: { teamId: team.id, playerExtId },
    });

    const roster = await loadRosterWithComputed(team.id);
    return NextResponse.json({ team, roster });
}
