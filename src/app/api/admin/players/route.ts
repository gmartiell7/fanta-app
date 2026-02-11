import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);

        // /api/admin/players?team=...&role=...&q=...
        const team = url.searchParams.get("team")?.trim() || null;
        const role = url.searchParams.get("role")?.trim() || null;
        const q = url.searchParams.get("q")?.trim() || null;

        const where: Prisma.PlayerWhereInput = {};

        if (team) where.team = team;

        // role query => roleMantra
        if (role) where.roleMantra = role;

        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { team: { contains: q, mode: "insensitive" } },
                { roleMantra: { contains: q, mode: "insensitive" } },
                { roleClassic: { contains: q, mode: "insensitive" } },
            ];
        }

        const [total, players] = await Promise.all([
            prisma.player.count({ where }),
            prisma.player.findMany({
                where,
                orderBy: [{ team: "asc" }, { roleMantra: "asc" }, { name: "asc" }],
                select: {
                    id: true,
                    extId: true,
                    name: true,
                    team: true,
                    roleMantra: true,
                    roleClassic: true,

                    // ✅ prezzi separati (Classic = Qt.A, Mantra = Qt.A M)
                    priceClassic: true,
                    priceMantra: true,

                    // ✅ meta listone
                    group: true,
                    rigorista: true,
                    calciPiazzati: true,
                    possibleSpend: true,
                },
            }),
        ]);

        return NextResponse.json({ total, players });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
