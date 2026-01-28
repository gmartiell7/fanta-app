// ✅ CREA QUESTO FILE (se non esiste)
// src/app/api/logica/fav-rows/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

type CategoryKey = "scudetto" | "europa" | "tranquilla" | "salvezzaSoft" | "salvezzaHard";
type CatState = Record<CategoryKey, string[]>;
type CatLetter = "A" | "B" | "C" | "D" | "E";

const CAT_INDEX: Record<CatLetter, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

function emptyCatState(): CatState {
    return {
        scudetto: Array.from({ length: 3 }, () => ""),
        europa: Array.from({ length: 4 }, () => ""),
        tranquilla: Array.from({ length: 6 }, () => ""),
        salvezzaSoft: Array.from({ length: 4 }, () => ""),
        salvezzaHard: Array.from({ length: 3 }, () => ""),
    };
}

function normTeamName(s: string) {
    return (s ?? "").trim();
}

// Alias robusti: full name + abbreviazioni listone + casi speciali
function canonicalTeamName(s: string) {
    const t = normTeamName(s);
    const lower = t.toLowerCase();

    // Verona
    if (lower === "hellas verona" || lower === "hellasverona" || lower === "ver") return "Verona";

    // Abbreviazioni tipiche listone (aggiunte per evitare mismatch)
    const map: Record<string, string> = {
        ata: "Atalanta",
        bol: "Bologna",
        cdr: "Cagliari",
        cag: "Cagliari",
        com: "Como",
        emp: "Empoli",
        fio: "Fiorentina",
        gen: "Genoa",
        int: "Inter",
        juv: "Juventus",
        laz: "Lazio",
        lec: "Lecce",
        mil: "Milan",
        mon: "Monza",
        nap: "Napoli",
        par: "Parma",
        rom: "Roma",
        sal: "Salernitana",
        sas: "Sassuolo",
        tor: "Torino",
        udi: "Udinese",
        ven: "Venezia",
    };

    if (map[lower]) return map[lower];

    return t;
}

function teamKey(s: string) {
    const canon = canonicalTeamName(s);
    return normTeamName(canon)
        .toLowerCase()
        .replace(/[’'`.]/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .trim();
}

function parsePredictionToCats(text: string): CatState {
    const base = emptyCatState();
    const t = String(text ?? "");

    const getList = (label: string) => {
        const re = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "im");
        const m = t.match(re);
        if (!m || !m[1]) return [];
        return m[1].split(",").map((x) => x.trim()).filter(Boolean);
    };

    const sc = getList("SCUDETTO");
    const eu = getList("EUROPA");
    const tr = getList("TRANQUILLA");
    const ss = getList("SALVEZZA_SOFT");
    const sh = getList("SALVEZZA_HARD");

    base.scudetto = [...sc.slice(0, base.scudetto.length), ...base.scudetto].slice(0, base.scudetto.length);
    base.europa = [...eu.slice(0, base.europa.length), ...base.europa].slice(0, base.europa.length);
    base.tranquilla = [...tr.slice(0, base.tranquilla.length), ...base.tranquilla].slice(0, base.tranquilla.length);
    base.salvezzaSoft = [...ss.slice(0, base.salvezzaSoft.length), ...base.salvezzaSoft].slice(0, base.salvezzaSoft.length);
    base.salvezzaHard = [...sh.slice(0, base.salvezzaHard.length), ...base.salvezzaHard].slice(0, base.salvezzaHard.length);

    return base;
}

function flattenAllSelected(state: CatState) {
    return Object.values(state).flat().map(normTeamName).filter(Boolean);
}

function buildTeamKeyToCat(cats: CatState) {
    const catByKey = new Map<string, CatLetter>();
    const displayByKey = new Map<string, string>();

    const add = (team: string, c: CatLetter) => {
        const canon = canonicalTeamName(team);
        const t = normTeamName(canon);
        if (!t) return;
        const k = teamKey(t);
        catByKey.set(k, c);
        if (!displayByKey.has(k)) displayByKey.set(k, t);
    };

    for (const t of cats.scudetto) add(t, "A");
    for (const t of cats.europa) add(t, "B");
    for (const t of cats.tranquilla) add(t, "C");
    for (const t of cats.salvezzaSoft) add(t, "D");
    for (const t of cats.salvezzaHard) add(t, "E");

    return { catByKey, displayByKey };
}

function scoreForMatch(teamCat: CatLetter, oppCat: CatLetter, isHome: boolean) {
    const t = CAT_INDEX[teamCat];
    const o = CAT_INDEX[oppCat];

    let pts = 1;
    const diff = o - t;

    if (diff > 0) pts += 0.25 * diff;
    if (diff < 0) pts -= 0.125 * Math.abs(diff);

    // (manteniamo la tua logica attuale del file logica)
    if (isHome && t > o) pts += 1;

    return Math.round(pts * 1000) / 1000;
}

export async function GET() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ favRows: [] }, { status: 200 });

    const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!dbUser?.id) return NextResponse.json({ favRows: [] }, { status: 200 });

    const prediction = await prisma.userPrediction.findUnique({
        where: { userId: dbUser.id },
        select: { text: true },
    });

    const predictionText = prediction?.text ?? "";
    const cats = parsePredictionToCats(predictionText);
    const chosen = flattenAllSelected(cats);

    const uniqueChosen = new Set(chosen.map((t) => teamKey(t)));
    const catsValid = chosen.length === 20 && uniqueChosen.size === 20;
    if (!catsValid) return NextResponse.json({ favRows: [] }, { status: 200 });

    const latest = await prisma.player.findFirst({
        select: { stats: { select: { matchday: true }, orderBy: { matchday: "desc" }, take: 1 } },
    });
    const loadedMatchdaysGlobal = latest?.stats?.[0]?.matchday ? Number(latest.stats[0].matchday) : 0;
    const startFrom = loadedMatchdaysGlobal + 1;

    const seasonRow = await prisma.serieACalendarMatch.findFirst({
        select: { season: true },
        orderBy: { createdAt: "desc" },
    });
    const calendarSeason = seasonRow?.season ?? "";
    if (!calendarSeason) return NextResponse.json({ favRows: [] }, { status: 200 });

    const calendarMatches =
        startFrom >= 1
            ? await prisma.serieACalendarMatch.findMany({
                where: { season: calendarSeason, matchday: { gte: startFrom } },
                select: { matchday: true, homeTeam: true, awayTeam: true },
                orderBy: [{ matchday: "asc" }, { homeTeam: "asc" }],
            })
            : [];

    if (calendarMatches.length === 0) return NextResponse.json({ favRows: [] }, { status: 200 });

    const { catByKey, displayByKey } = buildTeamKeyToCat(cats);

    const totals = new Map<string, { key: string; team: string; cat: CatLetter; games: number; points: number }>();
    for (const [k, c] of catByKey.entries()) {
        totals.set(k, { key: k, team: displayByKey.get(k) ?? k, cat: c, games: 0, points: 0 });
    }

    const add = (teamRaw: string, pts: number) => {
        const k = teamKey(teamRaw);
        const cur = totals.get(k);
        if (!cur) return;
        cur.games += 1;
        cur.points += pts;
    };

    for (const m of calendarMatches) {
        const homeK = teamKey(m.homeTeam);
        const awayK = teamKey(m.awayTeam);

        const homeCat = catByKey.get(homeK);
        const awayCat = catByKey.get(awayK);

        if (!homeCat || !awayCat) continue;

        add(m.homeTeam, scoreForMatch(homeCat, awayCat, true));
        add(m.awayTeam, scoreForMatch(awayCat, homeCat, false));
    }

    const favRows = Array.from(totals.values())
        .map((r) => ({
            team: r.team,
            cat: r.cat,
            games: r.games,
            points: Math.round(r.points * 1000) / 1000,
        }))
        .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team, "it"));

    return NextResponse.json({ favRows }, { status: 200 });
}
