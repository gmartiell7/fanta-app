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

        // ✅ where tipizzato correttamente
        const where: Prisma.PlayerWhereInput = {};

        if (team) where.team = team;

        // Qui "role" dalla query lo mappiamo sul campo vero del DB: roleMantra
        if (role) where.roleMantra = role;

        if (q) {
            where.OR = [
                { name: { contains: q, mode: "insensitive" } },
                { team: { contains: q, mode: "insensitive" } },
                { roleMantra: { contains: q, mode: "insensitive" } },
            ];
        }

        const [total, players] = await Promise.all([
            prisma.player.count({ where }),
            prisma.player.findMany({
                where,
                orderBy: [{ team: "asc" }, { roleMantra: "asc" }, { name: "asc" }],
                select: {
                    id: true,
                    name: true,
                    team: true,
                    roleMantra: true,
                },
            }),
        ]);

        return NextResponse.json({ total, players });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
