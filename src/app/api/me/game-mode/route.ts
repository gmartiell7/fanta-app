import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { GameMode } from "@prisma/client";

function normalizeGameMode(v: unknown): GameMode | null {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "MANTRA") return GameMode.MANTRA;
    if (s === "CLASSIC") return GameMode.CLASSIC;
    return null;
}

async function getAuthedEmail(): Promise<string | null> {
    const session = await getServerSession(authOptions);
    return session?.user?.email ?? null;
}

export async function GET() {
    const email = await getAuthedEmail();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email },
        select: { gameMode: true },
    });

    return NextResponse.json({ gameMode: user?.gameMode ?? GameMode.MANTRA });
}

export async function POST(req: Request) {
    const email = await getAuthedEmail();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { gameMode?: unknown } | null;
    const gameMode = normalizeGameMode(body?.gameMode);

    if (!gameMode) {
        return NextResponse.json({ error: "Invalid gameMode" }, { status: 400 });
    }

    // evito update se non serve
    const current = await prisma.user.findUnique({
        where: { email },
        select: { gameMode: true },
    });

    if ((current?.gameMode ?? GameMode.MANTRA) === gameMode) {
        return NextResponse.json({ gameMode });
    }

    const updated = await prisma.user.update({
        where: { email },
        data: { gameMode },
        select: { gameMode: true },
    });

    return NextResponse.json({ gameMode: updated.gameMode });
}
