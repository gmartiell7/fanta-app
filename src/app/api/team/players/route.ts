import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { calcFmvMeClient } from "@/lib/fantaConfig";

type GameMode = "MANTRA" | "CLASSIC";

type AuthedUser = { id: string; gameMode: GameMode };

async function getAuthedUser(): Promise<AuthedUser | null> {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return null;

    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, gameMode: true },
    });
    if (!user?.id) return null;

    const mode: GameMode =
        String(user.gameMode ?? "MANTRA").toUpperCase() === "CLASSIC"
            ? "CLASSIC"
            : "MANTRA";

    return { id: user.id, gameMode: mode };
}

async function getOrCreateTeam(userId: string) {
    const existing = await prisma.team.findUnique({ where: { ownerId: userId } });
    if (existing) return existing;

    return prisma.team.create({
        data: { ownerId: userId, name: "Senza nome" },
    });
}

function splitMulti(s?: string | null) {
    return String(s ?? "")
        .split(/[\/;]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

type StatForFmv = {
    vote: number | null;
    gf: number | null;
    gs: number | null;
    rp: number | null;
    rs: number | null;
    rf: number | null;
    au: number | null;
    amm: number | null;
    esp: number | null;
    ass: number | null;
};

/**
 * Carica la rosa e calcola:
 * - pg: count MatchdayStat validi (vote != null e voteRaw != "6*")
 * - mv: media vote
 * - fmv: media formula (IDENTICA a MeClient)
 */
async function loadRosterWithComputed(teamId: string) {
    const roster = await prisma.teamPlayer.findMany({
        where: { teamId },
        orderBy: { createdAt: "asc" },
        select: {
            id: true,
            player: {
                select: {
                    id: true,
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

    const agg = new Map<string, { pg: number; sumVote: number; sumFmv: number }>();

    for (const s of stats) {
        const vote = s.vote;
        if (vote == null) continue;

        const fmv = calcFmvMeClient({
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

        // calcFmvMeClient può teoricamente tornare null se vote è null, ma qui vote è sempre numero
        if (fmv == null) continue;

        const cur = agg.get(s.playerId) ?? { pg: 0, sumVote: 0, sumFmv: 0 };
        cur.pg += 1;
        cur.sumVote += vote;
        cur.sumFmv += fmv;
        agg.set(s.playerId, cur);
    }

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
    const user = await getAuthedUser();
    if (!user) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const team = await getOrCreateTeam(user.id);
    const roster = await loadRosterWithComputed(team.id);

    return NextResponse.json({ team, roster, gameMode: user.gameMode });
}

export async function POST(req: Request) {
    const user = await getAuthedUser();
    if (!user) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { playerExtId?: number } | null;
    const playerExtId = Number(body?.playerExtId);

    if (!Number.isFinite(playerExtId)) {
        return NextResponse.json({ error: "playerExtId non valido" }, { status: 400 });
    }

    const team = await getOrCreateTeam(user.id);

    const player = await prisma.player.findUnique({
        where: { extId: playerExtId },
        select: { extId: true, roleMantra: true, roleClassic: true },
    });
    if (!player) {
        return NextResponse.json({ error: "Giocatore non trovato" }, { status: 404 });
    }

    const isGk =
        user.gameMode === "CLASSIC"
            ? splitMulti(player.roleClassic).includes("P")
            : splitMulti(player.roleMantra).some((r) => r.toLowerCase() === "por");

    if (isGk) {
        const porCount =
            user.gameMode === "CLASSIC"
                ? await prisma.teamPlayer.count({
                    where: {
                        teamId: team.id,
                        player: { roleClassic: { contains: "P", mode: "insensitive" } },
                    },
                })
                : await prisma.teamPlayer.count({
                    where: {
                        teamId: team.id,
                        player: { roleMantra: { contains: "Por", mode: "insensitive" } },
                    },
                });

        if (porCount >= 3) {
            return NextResponse.json({ error: "Max 3 portieri" }, { status: 400 });
        }
    }

    try {
        await prisma.teamPlayer.create({
            data: { teamId: team.id, playerExtId },
        });
    } catch {
        // già in rosa
    }

    const roster = await loadRosterWithComputed(team.id);
    return NextResponse.json({ team, roster, gameMode: user.gameMode });
}

export async function DELETE(req: Request) {
    const user = await getAuthedUser();
    if (!user) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

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
    return NextResponse.json({ team, roster, gameMode: user.gameMode });
}
