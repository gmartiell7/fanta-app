import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "ADMIN") {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const [tp, st, pl] = await prisma.$transaction([
        prisma.teamPlayer.deleteMany({}),
        prisma.matchdayStat.deleteMany({}),
        prisma.player.deleteMany({}),
    ]);

    return NextResponse.json({
        ok: true,
        deleted: {
            teamPlayers: tp.count,
            stats: st.count,
            players: pl.count,
        },
    });
}
