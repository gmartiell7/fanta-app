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
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { email },
        select: { gameMode: true },
    });

    return NextResponse.json({ ok: true, gameMode: user?.gameMode ?? GameMode.MANTRA });
}

export async function POST(req: Request) {
    const email = await getAuthedEmail();
    if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { gameMode?: unknown } | null;
    const nextMode = normalizeGameMode(body?.gameMode);

    if (!nextMode) {
        return NextResponse.json({ ok: false, error: "Invalid gameMode" }, { status: 400 });
    }

    const current = await prisma.user.findUnique({
        where: { email },
        select: { gameMode: true },
    });

    const previous = current?.gameMode ?? GameMode.MANTRA;

    if (previous === nextMode) {
        return NextResponse.json({ ok: true, gameMode: nextMode, previous });
    }

    const updated = await prisma.user.update({
        where: { email },
        data: { gameMode: nextMode },
        select: { gameMode: true },
    });

    return NextResponse.json({ ok: true, gameMode: updated.gameMode, previous });
}
