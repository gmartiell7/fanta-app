import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

function splitRoles(roleMantra: string) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    // prendiamo solo il campo roleMantra
    const rows = await prisma.player.findMany({
        select: { roleMantra: true },
    });

    // esplodiamo multi-ruolo e facciamo distinct lato app
    const set = new Set<string>();
    for (const r of rows) {
        for (const base of splitRoles(r.roleMantra)) set.add(base);
    }

    const roles = Array.from(set).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ roles });
}
