import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

type CategoryLetter = "A" | "B" | "C" | "D" | "E";

type Body = {
    startMatchday: number; // es: 23
    categories: Record<string, CategoryLetter>; // teamName -> A..E
    season?: string; // opzionale; se non c'è prendiamo la più recente
};

const CAT_INDEX: Record<CategoryLetter, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

function safeTeamKey(s: string) {
    return (s ?? "").trim();
}

// Regole:
// base 1 se pari categoria
// avversario più debole (categoria successiva) => +0.25 per step
// avversario più forte (categoria precedente) => -0.125 per step
// bonus casa: se squadra di casa è più debole dell'avversaria (categoria successiva) => +0.125
function scoreForMatch(teamCat: CategoryLetter, oppCat: CategoryLetter, isHome: boolean) {
    const t = CAT_INDEX[teamCat];
    const o = CAT_INDEX[oppCat];

    let pts = 1;

    const diff = o - t; // positivo: avversario più debole; negativo: avversario più forte

    if (diff > 0) pts += 0.25 * diff;
    if (diff < 0) pts -= 0.125 * Math.abs(diff);

    if (isHome && t > o) pts += 0.125;

    return Math.round(pts * 1000) / 1000;
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    let body: Body;
    try {
        body = (await req.json()) as Body;
    } catch {
        return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
    }

    const startMatchday = Number(body.startMatchday ?? 0);
    if (!Number.isFinite(startMatchday) || startMatchday <= 0) {
        return NextResponse.json({ error: "startMatchday non valido" }, { status: 400 });
    }

    const categories = body.categories ?? {};
    const catEntries = Object.entries(categories)
        .map(([k, v]) => [safeTeamKey(k), v] as const)
        .filter(([k]) => k.length > 0);

    if (catEntries.length < 20) {
        return NextResponse.json(
            { error: "Categorie incomplete: devono esserci 20 squadre mappate (teamName -> A..E)." },
            { status: 400 }
        );
    }

    const catMap = new Map<string, CategoryLetter>(catEntries);

    // season: se non passata, prendiamo la più recente (lexicographically desc)
    let season = (body.season ?? "").trim();
    if (!season) {
        const latest = await prisma.serieACalendarMatch.findFirst({
            orderBy: { season: "desc" },
            select: { season: true },
        });
        season = latest?.season ?? "";
    }

    if (!season) {
        return NextResponse.json({ error: "Calendario non trovato (season mancante nel DB)." }, { status: 400 });
    }

    const matches = await prisma.serieACalendarMatch.findMany({
        where: {
            season,
            matchday: { gte: startMatchday },
        },
        orderBy: [{ matchday: "asc" }, { homeTeam: "asc" }, { awayTeam: "asc" }],
        select: {
            matchday: true,
            homeTeam: true,
            awayTeam: true,
        },
    });

    const ptsByTeam = new Map<string, { team: string; points: number; games: number }>();

    function add(team: string, points: number) {
        const key = safeTeamKey(team);
        const cur = ptsByTeam.get(key) ?? { team: key, points: 0, games: 0 };
        cur.points += points;
        cur.games += 1;
        ptsByTeam.set(key, cur);
    }

    for (const m of matches) {
        const home = safeTeamKey(m.homeTeam);
        const away = safeTeamKey(m.awayTeam);

        const homeCat = catMap.get(home);
        const awayCat = catMap.get(away);

        // se nel calendario ci sono nomi non mappati nelle categorie, saltiamo
        if (!homeCat || !awayCat) continue;

        const homePts = scoreForMatch(homeCat, awayCat, true);
        const awayPts = scoreForMatch(awayCat, homeCat, false);

        add(home, homePts);
        add(away, awayPts);
    }

    // Output completo: tutte le 20 squadre anche se non hanno match futuri
    for (const team of catMap.keys()) {
        if (!ptsByTeam.has(team)) ptsByTeam.set(team, { team, points: 0, games: 0 });
    }

    const rows = Array.from(ptsByTeam.values())
        .map((r) => ({
            team: r.team,
            games: r.games,
            points: Math.round(r.points * 1000) / 1000,
            avg: r.games > 0 ? Math.round((r.points / r.games) * 1000) / 1000 : 0,
        }))
        .sort((a, b) => b.points - a.points || b.avg - a.avg || a.team.localeCompare(b.team, "it"));

    return NextResponse.json({
        season,
        startMatchday,
        matchesCount: matches.length,
        rows,
    });
}
