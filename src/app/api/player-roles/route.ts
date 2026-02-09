import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type Mode = "MANTRA" | "CLASSIC";

function normalizeMode(v: string | null): Mode | null {
    const s = String(v ?? "").trim().toUpperCase();
    if (s === "CLASSIC") return "CLASSIC";
    if (s === "MANTRA") return "MANTRA";
    return null;
}

function splitRoles(roleMantra: string) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // ✅ se mode è passato in query, lo rispettiamo, altrimenti usiamo quello dell’utente
    const modeFromQuery = normalizeMode(searchParams.get("mode"));

    let mode: Mode;
    if (modeFromQuery) {
        mode = modeFromQuery;
    } else {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { gameMode: true },
        });
        mode = user?.gameMode === "CLASSIC" ? "CLASSIC" : "MANTRA";
    }

    // ✅ CLASSIC: ruoli fissi
    if (mode === "CLASSIC") {
        return NextResponse.json({
            mode,
            roles: ["P", "D", "C", "A"],
        });
    }

    // ✅ MANTRA: ruoli dinamici da DB
    const rows = await prisma.player.findMany({
        select: { roleMantra: true },
    });

    const set = new Set<string>();
    for (const r of rows) {
        for (const base of splitRoles(r.roleMantra)) {
            set.add(base);
        }
    }

    const roles = Array.from(set).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
        mode,
        roles,
    });
}
