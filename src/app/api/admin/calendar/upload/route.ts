import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

function parseCsvLine(line: string) {
    // Split semplice CSV (il tuo non ha virgolette complesse negli esempi)
    return line.split(",").map((x) => x.trim());
}

function parseDateMaybe(s: string) {
    // formato: 23/08/2025 18:30
    const v = s.trim();
    if (!v) return null;

    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = Number(m[4]);
    const MM = Number(m[5]);

    // Date in locale server: usiamo UTC per stabilità
    return new Date(Date.UTC(yyyy, mm - 1, dd, HH, MM, 0));
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    if (!isAdminEmail(email)) return NextResponse.json({ error: "Solo admin" }, { status: 403 });

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "FormData mancante" }, { status: 400 });

    const file = form.get("file") as File | null;
    const season = String(form.get("season") ?? "2025-2026").trim();
    if (!file) return NextResponse.json({ error: "Seleziona un file" }, { status: 400 });

    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return NextResponse.json({ error: "File vuoto o non valido" }, { status: 400 });

    // header atteso:
    // Match Number,Round Number,Date,Location,Home Team,Away Team,Result
    const header = lines[0].toLowerCase();
    const hasHome = header.includes("home") && header.includes("away");
    const hasRound = header.includes("round");
    if (!hasHome || !hasRound) {
        return NextResponse.json(
            { error: "Header non riconosciuto. Atteso: Match Number, Round Number, Date, Location, Home Team, Away Team, Result" },
            { status: 400 }
        );
    }

    let inserted = 0;

    for (let i = 1; i < lines.length; i++) {
        const parts = parseCsvLine(lines[i]);
        // [0]=Match Number, [1]=Round Number, [2]=Date, [3]=Location, [4]=Home Team, [5]=Away Team, [6]=Result
        if (parts.length < 6) continue;

        const matchday = parseInt(parts[1], 10);
        const date = parseDateMaybe(parts[2]);
        const location = parts[3] ? parts[3] : null;
        const homeTeam = parts[4] ?? "";
        const awayTeam = parts[5] ?? "";
        const result = parts[6] ? parts[6] : null;

        if (!Number.isFinite(matchday) || matchday <= 0) continue;
        if (!homeTeam || !awayTeam) continue;

        await prisma.serieACalendarMatch.upsert({
            where: {
                season_matchday_homeTeam_awayTeam: {
                    season,
                    matchday,
                    homeTeam,
                    awayTeam,
                },
            },
            update: { date, location, result },
            create: { season, matchday, date, location, homeTeam, awayTeam, result },
        });

        inserted++;
    }

    return NextResponse.json({ ok: true, season, inserted });
}
