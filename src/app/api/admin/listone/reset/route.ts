import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdminEmail } from "@/lib/admin";

export async function POST() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email?.toLowerCase() ?? null;

    if (!email) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { role: true },
    });

    const isAdmin = dbUser?.role === "ADMIN" || isAdminEmail(email);
    if (!isAdmin) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
    }

    const [tp, st, pl] = await prisma.$transaction([
        prisma.teamPlayer.deleteMany({}),
        prisma.matchdayStat.deleteMany({}),
        prisma.player.deleteMany({}),
    ]);

    return NextResponse.json({ ok: true, deleted: { teamPlayers: tp.count, stats: st.count, players: pl.count } });
}
