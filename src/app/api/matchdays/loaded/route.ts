import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // vedi nota sotto se non ce l'hai

export const dynamic = "force-dynamic";

export async function GET() {
    // Raggruppa per matchday e conta quante righe hai per ciascuna giornata
    const rows = await prisma.matchdayStat.groupBy({
        by: ["matchday"],
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { updatedAt: true },
        orderBy: { matchday: "asc" },
    });

    const loadedMatchdays = rows.map((r) => r.matchday);
    const lastLoaded = loadedMatchdays.length
        ? loadedMatchdays[loadedMatchdays.length - 1]
        : null;

    return NextResponse.json({
        loadedMatchdays, // es: [1,2,3,4,5]
        lastLoaded,      // es: 5
        total: loadedMatchdays.length,
        byMatchday: rows.map((r) => ({
            matchday: r.matchday,
            rows: r._count._all,          // quante stat hai per quella giornata
            firstInsertAt: r._min.createdAt,
            lastUpdateAt: r._max.updatedAt,
        })),
    });
}
