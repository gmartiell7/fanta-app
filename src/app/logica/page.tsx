// src/app/logica/page.tsx
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import InfoTip from "@/components/InfoTip";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MANTRA_ORDER = ["Por", "Dc", "Dd", "Ds", "E", "M", "C", "W", "T", "A", "Pc"] as const;

function splitRoles(roleMantra?: string | null) {
    return String(roleMantra ?? "")
        .split(/[\/;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function normRole(r: string) {
    const x = r.trim();
    if (!x) return "";
    const lower = x.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

type StatRow = {
    matchday: number;
    vote: number | null;
    gf: number;
    gs: number;
    rp: number;
    rs: number;
    rf: number;
    au: number;
    amm: number;
    esp: number;
    ass: number;
};

function calcMvFromStats(stats: Pick<StatRow, "vote">[]): number | null {
    const votes = stats.map((s) => s.vote).filter((v): v is number => v !== null);
    if (votes.length === 0) return null;
    return votes.reduce((a, b) => a + b, 0) / votes.length;
}

// ⚠️ Se nel tuo team/page.tsx la FMV è diversa, cambia SOLO questa funzione.
function calcFmvMatch(s: Omit<StatRow, "matchday">): number | null {
    if (s.vote === null) return null;
    return (
        s.vote +
        s.gf * 3 -
        s.gs * 1 +
        s.rp * 3 -
        s.rs * 3 +
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

function calcFmvFromStats(stats: Omit<StatRow, "matchday">[]): number | null {
    const fmvs = stats.map(calcFmvMatch).filter((v): v is number => v !== null);
    if (fmvs.length === 0) return null;
    return fmvs.reduce((a, b) => a + b, 0) / fmvs.length;
}

function formatNum(n: number | null) {
    if (n === null) return "—";
    return n.toFixed(2);
}

type Row = {
    id: string;
    name: string;
    team: string;
    played: number;
    mv: number | null;
    fmv: number | null;

    voteByDay: Record<number, number>;
    fmvByDay: Record<number, number>;
    voteNullableByDay: Record<number, number | null>;
};

/* -----------------------------
   ✅ Team colors based on Fav Calendar ranking tiers
--------------------------------*/
type TeamColor = { row: string; badge: string; text: string };

function tierFromRank(pos1based: number) {
    if (pos1based <= 4) return 1;
    if (pos1based <= 8) return 2;
    if (pos1based <= 12) return 3;
    if (pos1based <= 16) return 4;
    return 5; // 17-20
}

function colorFromTier(tier: 1 | 2 | 3 | 4 | 5): TeamColor {
    // neon green -> red acceso
    switch (tier) {
        case 1:
            return { row: "bg-lime-200/70", badge: "bg-lime-400 text-black", text: "text-lime-900" };
        case 2:
            return { row: "bg-emerald-200/70", badge: "bg-emerald-400 text-black", text: "text-emerald-900" };
        case 3:
            return { row: "bg-yellow-200/80", badge: "bg-yellow-400 text-black", text: "text-yellow-900" };
        case 4:
            return { row: "bg-orange-200/80", badge: "bg-orange-400 text-black", text: "text-orange-900" };
        case 5:
            return { row: "bg-red-200/80", badge: "bg-red-500 text-white", text: "text-red-900" };
    }
}

function RankingTable({
    title,
    metricLabel,
    getMetric,
    rows,
    totalMatchdays,
    getTeamColor,
}: {
    title: string;
    metricLabel: "MV" | "FMV";
    getMetric: (r: Row) => number | null;
    rows: Row[];
    totalMatchdays: number;
    getTeamColor: (teamName: string) => TeamColor | undefined;
}) {
    const sorted = [...rows].sort((a, b) => {
        const am = getMetric(a) ?? -Infinity;
        const bm = getMetric(b) ?? -Infinity;
        if (bm !== am) return bm - am;
        if (b.played !== a.played) return b.played - a.played;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="w-[520px] shrink-0 rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <InfoTip
                        text={
                            metricLabel === "MV"
                                ? "MV = media dei voti non null. Se un voto è null non viene conteggiato."
                                : "FMV = voto + bonus/malus (gol, assist, ammonizioni, ecc). Se voto è null → FMV null."
                        }
                    />
                </div>
                <div className="text-xs text-gray-500">Ordinato per {metricLabel} (desc)</div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="py-2 px-2">#</th>
                            <th className="py-2 px-2">Giocatore</th>
                            <th className="py-2 px-2">Squadra</th>
                            <th className="py-2 px-2">{metricLabel}</th>
                            <th className="py-2 px-2">Pg</th>
                            <th className="py-2 px-2">Pt</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {sorted.length === 0 ? (
                            <tr>
                                <td className="py-3 text-gray-500" colSpan={6}>
                                    Nessun giocatore
                                </td>
                            </tr>
                        ) : (
                            sorted.map((r, idx) => {
                                const pt = Math.max(0, sorted.length - 1 - idx);
                                const c = getTeamColor(r.team);
                                return (
                                    <tr key={r.id} className={c?.row}>
                                        <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                                        <td className={`py-2 px-2 font-medium ${c ? c.text : ""}`}>{r.name}</td>
                                        <td className="py-2 px-2">
                                            <span
                                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c ? c.badge : "bg-gray-100 text-gray-700"
                                                    }`}
                                            >
                                                {r.team}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 tabular-nums">{formatNum(getMetric(r))}</td>
                                        <td className="py-2 px-2 tabular-nums">
                                            {r.played} / {totalMatchdays || "—"}
                                        </td>
                                        <td className="py-2 pr-1 tabular-nums font-semibold">{pt}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function computeDuelTotals(rows: Row[], totalMatchdays: number, getValueByDay: (r: Row, day: number) => number) {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.id, 0);

    for (let day = 1; day <= totalMatchdays; day++) {
        const vals = rows.map((r) => ({ id: r.id, v: getValueByDay(r, day) }));
        vals.sort((a, b) => a.v - b.v);

        const pointsById = new Map<string, number>();
        let i = 0;
        while (i < vals.length) {
            const v = vals[i].v;
            const firstIndex = i;
            let j = i;
            while (j < vals.length && vals[j].v === v) j++;
            for (let k = i; k < j; k++) pointsById.set(vals[k].id, firstIndex);
            i = j;
        }

        for (const r of rows) {
            totals.set(r.id, (totals.get(r.id) ?? 0) + (pointsById.get(r.id) ?? 0));
        }
    }

    const scored = rows.map((r) => ({
        id: r.id,
        name: r.name,
        team: r.team,
        pts: totals.get(r.id) ?? 0,
    }));

    scored.sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        return a.name.localeCompare(b.name);
    });

    return scored;
}

function DuelTotalsTable({
    title,
    subtitle,
    scored,
    getTeamColor,
}: {
    title: string;
    subtitle?: string;
    scored: { id: string; name: string; team: string; pts: number }[];
    getTeamColor: (teamName: string) => TeamColor | undefined;
}) {
    return (
        <div className="w-[420px] shrink-0 rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">
                    {title}
                    <a href="#duelli-note" className="ml-1 align-super text-xs text-gray-500 hover:text-gray-900">
                        *
                    </a>
                </h3>

                <InfoTip text="Duelli: per ogni giornata confronti il valore con tutti gli altri. Se il tuo è maggiore → +1. Null/mancante = 0. I punti sono cumulati su tutte le giornate." />
            </div>

            {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="py-2 px-2">#</th>
                            <th className="py-2 px-2">Giocatore</th>
                            <th className="py-2 px-2">Squadra</th>
                            <th className="py-2 px-2">Punti</th>
                            <th className="py-2 px-2">Pt</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {scored.length === 0 ? (
                            <tr>
                                <td className="py-3 text-gray-500" colSpan={5}>
                                    Nessun giocatore
                                </td>
                            </tr>
                        ) : (
                            scored.map((x, idx) => {
                                const pt = Math.max(0, scored.length - 1 - idx);
                                const c = getTeamColor(x.team);
                                return (
                                    <tr key={x.id} className={c?.row}>
                                        <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                                        <td className={`py-2 px-2 font-medium ${c ? c.text : ""}`}>{x.name}</td>
                                        <td className="py-2 px-2">
                                            <span
                                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c ? c.badge : "bg-gray-100 text-gray-700"
                                                    }`}
                                            >
                                                {x.team}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 tabular-nums font-semibold">{x.pts}</td>
                                        <td className="py-2 px-2 tabular-nums font-semibold">{pt}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function computeRankPtMap(rows: Row[], getMetric: (r: Row) => number | null) {
    const sorted = [...rows].sort((a, b) => {
        const am = getMetric(a) ?? -Infinity;
        const bm = getMetric(b) ?? -Infinity;
        if (bm !== am) return bm - am;
        if (b.played !== a.played) return b.played - a.played;
        return a.name.localeCompare(b.name);
    });

    const ptById = new Map<string, number>();
    for (let idx = 0; idx < sorted.length; idx++) {
        ptById.set(sorted[idx].id, Math.max(0, sorted.length - 1 - idx));
    }
    return ptById;
}

function computeRankPtMapFromScored(scored: { id: string }[]) {
    const ptById = new Map<string, number>();
    for (let idx = 0; idx < scored.length; idx++) {
        ptById.set(scored[idx].id, Math.max(0, scored.length - 1 - idx));
    }
    return ptById;
}

function hasBonusLast5(row: Row, totalMatchdays: number) {
    if (totalMatchdays < 5) return false;
    for (let day = totalMatchdays - 4; day <= totalMatchdays; day++) {
        const v = row.voteNullableByDay[day];
        if (v === null || v === undefined) return false;
        if (v <= 6.5) return false;
    }
    return true;
}

function TopFlopTable({
    rows,
    mvPtById,
    fmvPtById,
    duelVotePtById,
    duelFmvPtById,
    totalMatchdays,
    getTeamColor,
}: {
    rows: Row[];
    mvPtById: Map<string, number>;
    fmvPtById: Map<string, number>;
    duelVotePtById: Map<string, number>;
    duelFmvPtById: Map<string, number>;
    totalMatchdays: number;
    getTeamColor: (teamName: string) => TeamColor | undefined;
}) {
    const list = rows.map((r) => {
        const base =
            (mvPtById.get(r.id) ?? 0) +
            (fmvPtById.get(r.id) ?? 0) +
            (duelVotePtById.get(r.id) ?? 0) +
            (duelFmvPtById.get(r.id) ?? 0);

        const bonus = hasBonusLast5(r, totalMatchdays);
        const total = bonus ? base * 1.5 : base;

        return { id: r.id, name: r.name, team: r.team, base, total, bonus };
    });

    list.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.base !== a.base) return b.base - a.base;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="w-[440px] shrink-0 rounded-xl border bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Da Top a Flop</h3>
                    <InfoTip text="Score = somma dei Pt delle 4 tabelle. Bonus 1.5x se nelle ultime 5 giornate ha preso voto ed è sempre > 6.5." />
                </div>
                <div className="text-xs text-gray-500">Somma Pt (4 tabelle) + bonus</div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                            <th className="py-2 px-2">#</th>
                            <th className="py-2 px-2">Giocatore</th>
                            <th className="py-2 px-2">Squadra</th>
                            <th className="py-2 px-2">Tot</th>
                            <th className="py-2 px-2">Bns</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {list.length === 0 ? (
                            <tr>
                                <td className="py-3 text-gray-500" colSpan={5}>
                                    Nessun giocatore
                                </td>
                            </tr>
                        ) : (
                            list.map((x, idx) => {
                                const c = getTeamColor(x.team);
                                return (
                                    <tr key={x.id} className={c?.row}>
                                        <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                                        <td className={`py-2 px-2 font-medium ${c ? c.text : ""}`}>{x.name}</td>
                                        <td className="py-2 px-2">
                                            <span
                                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c ? c.badge : "bg-gray-100 text-gray-700"
                                                    }`}
                                            >
                                                {x.team}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 tabular-nums font-semibold">
                                            {Number.isInteger(x.total) ? x.total : x.total.toFixed(1)}
                                        </td>
                                        <td className="py-2 pr-1 text-xs font-semibold">{x.bonus ? "1.5x" : "—"}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 text-xs text-gray-600">
                Bonus 1.5x se nelle <b>ultime 5</b> giornate ha preso voto e ha fatto sempre <b>&gt; 6.5</b>.
            </div>
        </div>
    );
}

/* -----------------------------
   ✅ Calendario favorevole (server) - FIX Hellas Verona -> Verona + Card in fondo
--------------------------------*/
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

// ✅ Alias “manuali” (qui risolvi Hellas Verona vs Verona)
function canonicalTeamName(s: string) {
    const t = normTeamName(s);

    // Mappa semplice: se vuoi aggiungere altri alias, mettili qui
    const lower = t.toLowerCase();

    // Verona
    if (lower === "hellas verona") return "Verona";
    if (lower === "hellasverona") return "Verona";

    return t;
}

// ✅ chiave robusta per matchare (spazi, apostrofi, ecc.) + alias
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

/**
 * Regole punti:
 * - base 1
 * - avversario in categoria successiva (più debole) => +0.25 per step
 * - avversario in categoria precedente (più forte) => -0.125 per step
 * - bonus casa: +1 SE la squadra di casa è in categoria successiva all’avversaria (cioè più debole)
 */
function scoreForMatch(teamCat: CatLetter, oppCat: CatLetter, isHome: boolean) {
    const t = CAT_INDEX[teamCat];
    const o = CAT_INDEX[oppCat];

    let pts = 1;
    const diff = o - t;

    if (diff > 0) pts += 0.25 * diff;
    if (diff < 0) pts -= 0.125 * Math.abs(diff);

    if (isHome && t > o) pts += 1;

    return Math.round(pts * 1000) / 1000;
}

export default async function LogicaPage() {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!email) {
        return (
            <main className="mx-auto max-w-6xl p-6">
                <h1 className="text-2xl font-bold">Logica</h1>
                <p className="mt-2 text-sm text-gray-600">Devi effettuare il login.</p>
            </main>
        );
    }

    const dbUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });

    if (!dbUser?.id) {
        return (
            <main className="mx-auto max-w-6xl p-6">
                <h1 className="text-2xl font-bold">Logica</h1>
                <p className="mt-2 text-sm text-gray-600">Sessione trovata ma utente non presente nel database.</p>
            </main>
        );
    }

    const team = await prisma.team.findUnique({
        where: { ownerId: dbUser.id },
        include: {
            players: {
                orderBy: { createdAt: "asc" },
                include: {
                    player: {
                        include: {
                            stats: {
                                select: {
                                    matchday: true,
                                    vote: true,
                                    gf: true,
                                    gs: true,
                                    rp: true,
                                    rs: true,
                                    rf: true,
                                    au: true,
                                    amm: true,
                                    esp: true,
                                    ass: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!team) {
        return (
            <main className="mx-auto max-w-6xl p-6">
                <h1 className="text-2xl font-bold">Logica</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Sei loggato, ma non hai ancora una squadra creata/associata a questo utente.
                </p>
            </main>
        );
    }

    // ✅ prediction salvata (categorie)
    const prediction = await prisma.userPrediction.findUnique({
        where: { userId: dbUser.id },
        select: { text: true },
    });

    const predictionText = prediction?.text ?? "";
    const cats = parsePredictionToCats(predictionText);
    const chosen = flattenAllSelected(cats);

    // ✅ validazione su key canoniche (così Verona/Hellas Verona non rompe)
    const uniqueChosen = new Set(chosen.map((t) => teamKey(t)));
    const catsValid = chosen.length === 20 && uniqueChosen.size === 20;

    // ✅ max giornata VOTI nel DB (globale)
    const latest = await prisma.player.findFirst({
        select: {
            stats: {
                select: { matchday: true },
                orderBy: { matchday: "desc" },
                take: 1,
            },
        },
    });
    const loadedMatchdaysGlobal = latest?.stats?.[0]?.matchday ? Number(latest.stats[0].matchday) : 0;
    const startFrom = loadedMatchdaysGlobal + 1;

    // ✅ stagione calendario (prendiamo l’ultima inserita)
    const seasonRow = await prisma.serieACalendarMatch.findFirst({
        select: { season: true },
        orderBy: { createdAt: "desc" },
    });
    const calendarSeason = seasonRow?.season ?? "";

    const calendarAgg =
        calendarSeason
            ? await prisma.serieACalendarMatch.aggregate({
                where: { season: calendarSeason },
                _max: { matchday: true },
                _count: { _all: true },
            })
            : null;

    const maxCalendarMatchday = calendarAgg?._max?.matchday ?? 0;
    const totalCalendarRows = calendarAgg?._count?._all ?? 0;
    const remainingMatchdays =
        maxCalendarMatchday && loadedMatchdaysGlobal ? Math.max(0, maxCalendarMatchday - loadedMatchdaysGlobal) : 0;
    const expectedRemainingMatches = remainingMatchdays ? remainingMatchdays * 10 : 0;

    const calendarMatches =
        calendarSeason && startFrom >= 1
            ? await prisma.serieACalendarMatch.findMany({
                where: { season: calendarSeason, matchday: { gte: startFrom } },
                select: { matchday: true, homeTeam: true, awayTeam: true },
                orderBy: [{ matchday: "asc" }, { homeTeam: "asc" }],
            })
            : [];

    // ✅ calcolo graduatoria calendario favorevole
    let favRows: { team: string; cat: CatLetter; games: number; points: number }[] = [];
    let diagUnmatchedTeams: string[] = [];
    const diagByMatchdayCount: Record<number, number> = {};

    if (catsValid && calendarMatches.length > 0) {
        const { catByKey, displayByKey } = buildTeamKeyToCat(cats);

        const totals = new Map<string, { key: string; team: string; cat: CatLetter; games: number; points: number }>();
        for (const [k, c] of catByKey.entries()) {
            totals.set(k, { key: k, team: displayByKey.get(k) ?? k, cat: c, games: 0, points: 0 });
        }

        const add = (teamRaw: string, pts: number) => {
            const k = teamKey(teamRaw);
            const cur = totals.get(k);
            if (!cur) return false;
            cur.games += 1;
            cur.points += pts;
            return true;
        };

        const unmatched = new Set<string>();

        for (const m of calendarMatches) {
            diagByMatchdayCount[m.matchday] = (diagByMatchdayCount[m.matchday] ?? 0) + 1;

            const homeK = teamKey(m.homeTeam);
            const awayK = teamKey(m.awayTeam);

            const homeCat = catByKey.get(homeK);
            const awayCat = catByKey.get(awayK);

            if (!homeCat) unmatched.add(m.homeTeam);
            if (!awayCat) unmatched.add(m.awayTeam);

            if (!homeCat || !awayCat) continue;

            add(m.homeTeam, scoreForMatch(homeCat, awayCat, true));
            add(m.awayTeam, scoreForMatch(awayCat, homeCat, false));
        }

        diagUnmatchedTeams = Array.from(unmatched).slice(0, 30);

        favRows = Array.from(totals.values())
            .map((r) => ({
                team: r.team,
                cat: r.cat,
                games: r.games,
                points: Math.round(r.points * 1000) / 1000,
            }))
            .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team, "it"));
    }

    // ✅ Mappa colori: teamKey -> TeamColor (basata sulla posizione in favRows)
    const teamColorByKey = new Map<string, TeamColor>();
    if (favRows.length > 0) {
        for (let i = 0; i < favRows.length; i++) {
            const pos = i + 1;
            const tier = tierFromRank(pos) as 1 | 2 | 3 | 4 | 5;
            const k = teamKey(favRows[i].team);
            teamColorByKey.set(k, colorFromTier(tier));
        }
    }
    const getTeamColor = (teamName: string) => teamColorByKey.get(teamKey(teamName));

    const anyZeros = favRows.some((r) => r.games === 0);

    const badMatchdays = Object.entries(diagByMatchdayCount)
        .map(([d, c]) => ({ day: Number(d), count: c }))
        .filter((x) => x.count !== 10)
        .slice(0, 20);

    const players = team.players.map((tp) => tp.player).sort((a, b) => a.extId - b.extId);

    const allMatchdays = players.flatMap((p) => (p.stats ?? []).map((s) => s.matchday ?? 0));
    const totalMatchdays = allMatchdays.length ? Math.max(...allMatchdays) : 0;

    const items = players.map((p) => {
        const roles = splitRoles(p.roleMantra).map(normRole);

        const stats: StatRow[] = (p.stats ?? []).map((s) => ({
            matchday: Number(s.matchday ?? 0),
            vote: s.vote === null || s.vote === undefined ? null : Number(s.vote),
            gf: Number(s.gf ?? 0),
            gs: Number(s.gs ?? 0),
            rp: Number(s.rp ?? 0),
            rs: Number(s.rs ?? 0),
            rf: Number(s.rf ?? 0),
            au: Number(s.au ?? 0),
            amm: Number(s.amm ?? 0),
            esp: Number(s.esp ?? 0),
            ass: Number(s.ass ?? 0),
        }));

        const played = stats.filter((st) => st.vote !== null).length;

        const voteByDay: Record<number, number> = {};
        const fmvByDay: Record<number, number> = {};
        const voteNullableByDay: Record<number, number | null> = {};

        for (const s of stats) {
            voteNullableByDay[s.matchday] = s.vote;
            voteByDay[s.matchday] = s.vote ?? 0;
            fmvByDay[s.matchday] = calcFmvMatch(s) ?? 0;
        }

        return {
            row: {
                id: p.id,
                name: p.name,
                team: p.team,
                played,
                mv: calcMvFromStats(stats),
                fmv: calcFmvFromStats(stats),
                voteByDay,
                fmvByDay,
                voteNullableByDay,
            } as Row,
            roles,
        };
    });

    const roleSet = new Set<string>();
    for (const it of items) for (const r of it.roles) if (r) roleSet.add(r);

    const extraRoles = [...roleSet]
        .filter((r) => !(MANTRA_ORDER as readonly string[]).includes(r))
        .sort((a, b) => a.localeCompare(b));

    const rolesSorted = [...MANTRA_ORDER.filter((r) => roleSet.has(r)), ...extraRoles];

    const computed = rolesSorted.map((role) => {
        const rows = items.filter((it) => it.roles.includes(role)).map((it) => it.row);
        return { role, rows };
    });

    return (
        <main className="mx-auto max-w-[2600px] p-4 md:p-8">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Logica</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Desktop compatto: per ogni ruolo tutte le tabelle sono sulla stessa linea (scroll orizzontale se serve).
                </p>
            </div>

            <div className="space-y-6">
                {computed.map(({ role, rows }) => {
                    const duelVote = computeDuelTotals(rows, totalMatchdays, (r, day) => r.voteByDay[day] ?? 0);
                    const duelFmv = computeDuelTotals(rows, totalMatchdays, (r, day) => r.fmvByDay[day] ?? 0);

                    const mvPtById = computeRankPtMap(rows, (r) => r.mv);
                    const fmvPtById = computeRankPtMap(rows, (r) => r.fmv);
                    const duelVotePtById = computeRankPtMapFromScored(duelVote);
                    const duelFmvPtById = computeRankPtMapFromScored(duelFmv);

                    return (
                        <section key={role} className="rounded-xl border bg-gray-50 p-4">
                            <div className="flex items-start gap-4">
                                <div className="w-24 shrink-0">
                                    <h2 className="text-xl font-semibold">{role}</h2>
                                    <div className="mt-1 text-xs text-gray-600">
                                        {rows.length} gioc.
                                        <br />
                                        Giornate: <span className="font-medium">{totalMatchdays || "—"}</span>
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1 overflow-x-auto">
                                    <div className="flex w-max gap-4">
                                        <RankingTable
                                            title="Graduatoria MV"
                                            metricLabel="MV"
                                            getMetric={(r) => r.mv}
                                            rows={rows}
                                            totalMatchdays={totalMatchdays}
                                            getTeamColor={getTeamColor}
                                        />
                                        <RankingTable
                                            title="Graduatoria FMV"
                                            metricLabel="FMV"
                                            getMetric={(r) => r.fmv}
                                            rows={rows}
                                            totalMatchdays={totalMatchdays}
                                            getTeamColor={getTeamColor}
                                        />
                                        <DuelTotalsTable
                                            title="Duelli cumulati (Voto)"
                                            subtitle={totalMatchdays ? `${totalMatchdays} giornate` : undefined}
                                            scored={duelVote}
                                            getTeamColor={getTeamColor}
                                        />
                                        <DuelTotalsTable
                                            title="Duelli cumulati (Fantavoto)"
                                            subtitle={totalMatchdays ? `${totalMatchdays} giornate` : undefined}
                                            scored={duelFmv}
                                            getTeamColor={getTeamColor}
                                        />
                                        <TopFlopTable
                                            rows={rows}
                                            mvPtById={mvPtById}
                                            fmvPtById={fmvPtById}
                                            duelVotePtById={duelVotePtById}
                                            duelFmvPtById={duelFmvPtById}
                                            totalMatchdays={totalMatchdays}
                                            getTeamColor={getTeamColor}
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>

            {/* Nota unica a fine pagina con anchor */}
            <div id="duelli-note" className="mt-8 rounded-xl border bg-white p-4 text-sm text-gray-700">
                <span className="font-semibold">*</span>{" "}
                Duelli: per giornata, contro tutti gli altri: se valore(g1) <b>&gt;</b> valore(g2) ⇒ <b>+1</b>. (null=0)
                <br />
                Pt: ultimo = 0, poi +1 risalendo.
            </div>

            {/* ✅ CARD: Calendario favorevole (spostata in fondo) */}
            <section className="mt-8 rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold">Calendario favorevole</h2>
                            <InfoTip text="Graduatoria basata sul calendario DB e sulla tua classifica teorica a categorie (A=Scudetto, B=Europa, C=Tranquilla, D=Salvezza soft, E=Salvezza hard)." />
                        </div>

                        <div className="mt-1 text-sm text-gray-600">
                            Partenza dalla <b>{startFrom}ª</b> giornata (voti nel DB fino alla <b>{loadedMatchdaysGlobal || "—"}ª</b>).
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            Season: <b>{calendarSeason || "—"}</b> · Righe calendario totali: <b>{totalCalendarRows}</b> · Max giornata calendario:{" "}
                            <b>{maxCalendarMatchday || "—"}</b>
                            <br />
                            Match letti da giornata {startFrom}: <b>{calendarMatches.length}</b> · Attesi (giornate rimanenti × 10):{" "}
                            <b>{expectedRemainingMatches || "—"}</b>
                        </div>
                    </div>

                    <div className="text-xs text-gray-600 max-w-[650px]">
                        <div className="font-semibold">Regole punti</div>
                        <div>
                            Base <b>1</b> · avversario più debole <b>+0,25</b> per categoria · avversario più forte <b>-0,125</b> per categoria · bonus casa{" "}
                            <b>+0,25</b> se la squadra di casa è in categoria successiva (più debole) dell’avversaria.
                        </div>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {!catsValid ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Per calcolare la graduatoria, prima salva una <b>classifica teorica valida</b> in <b>/me</b> (20 squadre, no duplicati).
                            <br />
                            Nota: ora consideriamo anche alias tipo <b>Hellas Verona → Verona</b>.
                        </div>
                    ) : calendarMatches.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Calendario non disponibile (nessun match futuro trovato da giornata {startFrom} in poi).
                        </div>
                    ) : (
                        <>
                            {expectedRemainingMatches > 0 && calendarMatches.length !== expectedRemainingMatches ? (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                                    <b>Attenzione:</b> il calendario futuro letto non torna con l’atteso.
                                    <br />
                                    Attesi <b>{expectedRemainingMatches}</b> match (giornate rimanenti {remainingMatchdays} × 10), ma trovati <b>{calendarMatches.length}</b>.
                                </div>
                            ) : null}

                            {diagUnmatchedTeams.length > 0 ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                    <b>Attenzione:</b> alcune squadre nel calendario non matchano la tua classifica (anche dopo alias + normalizzazione).
                                    <div className="mt-1 text-xs text-amber-950">Esempi: {diagUnmatchedTeams.join(", ")}</div>
                                </div>
                            ) : null}

                            {badMatchdays.length > 0 ? (
                                <details className="rounded-xl border bg-gray-50 p-3">
                                    <summary className="cursor-pointer text-sm font-semibold text-gray-800">Debug: giornate con numero match ≠ 10</summary>
                                    <div className="mt-2 text-xs text-gray-700">{badMatchdays.map((x) => `G${x.day}: ${x.count} match`).join(" · ")}</div>
                                </details>
                            ) : null}

                            {anyZeros ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                    Nota: almeno una squadra risulta con <b>0 partite</b>. Ora abbiamo risolto Verona/Hellas Verona; se resta, aggiungiamo altri alias.
                                </div>
                            ) : null}

                            {/* ✅ Legenda colori (posizione in graduatoria) */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-gray-600 mr-1">Legenda:</span>

                                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                                    <span className="h-3 w-3 rounded-sm bg-lime-400" />
                                    <span className="font-semibold text-lime-900">1–4</span>
                                </span>

                                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                                    <span className="h-3 w-3 rounded-sm bg-emerald-400" />
                                    <span className="font-semibold text-emerald-900">5–8</span>
                                </span>

                                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                                    <span className="h-3 w-3 rounded-sm bg-yellow-400" />
                                    <span className="font-semibold text-yellow-900">9–12</span>
                                </span>

                                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                                    <span className="h-3 w-3 rounded-sm bg-orange-400" />
                                    <span className="font-semibold text-orange-900">13–16</span>
                                </span>

                                <span className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1">
                                    <span className="h-3 w-3 rounded-sm bg-red-500" />
                                    <span className="font-semibold text-red-900">17–20</span>
                                </span>
                            </div>

                            <div className="overflow-x-auto rounded-xl border">
                                <table className="min-w-full text-sm">
                                    <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                                        <tr>
                                            <th className="py-2 px-2">#</th>
                                            <th className="py-2 px-2">Squadra</th>
                                            <th className="py-2 px-2">Cat</th>
                                            <th className="py-2 px-2">Gare</th>
                                            <th className="py-2 px-2">Punti</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {favRows.map((r, idx) => {
                                            const c = getTeamColor(r.team);
                                            return (
                                                <tr key={`${r.team}-${idx}`} className={c?.row}>
                                                    <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                                                    <td className={`py-2 px-2 font-medium ${c ? c.text : ""}`}>{r.team}</td>
                                                    <td className="py-2 px-2">
                                                        <span
                                                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${c ? c.badge : "bg-gray-100 text-gray-700"
                                                                }`}
                                                        >
                                                            {r.cat}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-2 tabular-nums">{r.games}</td>
                                                    <td className="py-2 px-2 tabular-nums font-semibold">{r.points}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <details className="rounded-xl border bg-gray-50 p-3">
                                <summary className="cursor-pointer text-sm font-semibold text-gray-800">Debug: classifica salvata</summary>
                                <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-700">{predictionText}</pre>
                            </details>
                        </>
                    )}
                </div>
            </section>
        </main>
    );
}
