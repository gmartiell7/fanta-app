"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

type UserWithRole = { role?: string; isAdmin?: boolean };

const TOTAL_MATCHDAYS = 38;

type CsvRow = Record<string, unknown>;

type UploadRow = {
    playerExtId: number;
    voteRaw?: string | null;
    vote?: number | null;
    gf?: number;
    gs?: number;
    rp?: number;
    rs?: number;
    rf?: number;
    au?: number;
    amm?: number;
    esp?: number;
    ass?: number;
};

function norm(v: unknown) {
    return String(v ?? "").replace(/\uFEFF/g, "").trim();
}

function toInt(v: unknown): number | null {
    const s = norm(v);
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toFloat(v: unknown): number | null {
    const s = norm(v);
    if (!s) return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
}

function normKey(k: string) {
    return norm(k)
        .toLowerCase()
        .replace(/[’'`.]/g, "")
        .replace(/\s+/g, "")
        .replace(/[^a-z0-9#]/g, "");
}

function splitBySep(line: string, sep: string) {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (ch === sep && !inQuotes) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}

// ✅ Fantacalcio.it: "Cod." è l’ID giocatore
const ID_KEYS = ["#", "id", "cod", "codice", "codgiocatore", "idgiocatore", "idplayer", "playerid"];
const VOTE_KEYS = ["voto", "v", "mv", "votostatistico", "votost", "votofg"];

const INT_KEYS = {
    gf: ["gf", "golfatti", "gol"],
    gs: ["gs", "golsubiti"],
    rp: ["rp", "rigoriparati"],
    rs: ["rs", "rigorisbagliati"],
    rf: ["rf", "rigorifatti"],
    au: ["au", "autogol"],
    amm: ["amm", "ammonizioni"],
    esp: ["esp", "espulsioni"],
    ass: ["ass", "assist"],
};

function buildNormRow(r: CsvRow) {
    const m: Record<string, unknown> = {};
    for (const k of Object.keys(r)) {
        m[normKey(k)] = r[k];
    }
    return m;
}

function getFieldNorm(r: Record<string, unknown>, keys: string[]) {
    for (const k of keys) {
        const v = r[k];
        if (v !== undefined && v !== null && norm(v) !== "") return v;
    }
    return undefined;
}

function findHeaderAndDelimiter(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\r/g, ""));
    const seps = [";", ",", "\t"];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (!raw || raw.trim().length === 0) continue;

        for (const sep of seps) {
            if (!raw.includes(sep)) continue;

            const cols = splitBySep(raw, sep).map((c) => normKey(c)).filter(Boolean);
            const hasId = cols.some((c) => ID_KEYS.includes(c));
            const hasVote = cols.some((c) => VOTE_KEYS.includes(c));

            if (hasId && hasVote) return { headerIndex: i, delimiter: sep, lines };
        }
    }
    return null;
}

async function readResponseBody(res: Response) {
    // prova JSON, altrimenti text
    const text = await res.text().catch(() => "");
    try {
        return { kind: "json" as const, value: JSON.parse(text) };
    } catch {
        return { kind: "text" as const, value: text };
    }
}

export default function AdminPage() {
    const { data: session, status } = useSession();

    const [file, setFile] = useState<File | null>(null);
    const [matchday, setMatchday] = useState<number>(1);

    const [loadedDays, setLoadedDays] = useState<number[]>([]);
    const [loadingDays, setLoadingDays] = useState(false);
    const [uploading, setUploading] = useState(false);

    const role = (session?.user as UserWithRole | undefined)?.role;
    const isAdmin = Boolean((session?.user as UserWithRole | undefined)?.isAdmin) || role === "ADMIN";

    // ✅ IMPORTANTISSIMO: niente return prima degli hook
    const canAccess = status !== "loading" && !!session && isAdmin;

    const loadedSet = useMemo(() => new Set(loadedDays), [loadedDays]);

    async function fetchLoadedDays() {
        setLoadingDays(true);
        try {
            const res = await fetch("/api/admin/matchdays/loaded", { cache: "no-store" });
            const body = await readResponseBody(res);

            if (!res.ok) {
                console.error("loaded endpoint error:", res.status, body);
                return;
            }

            const data = body.kind === "json" ? body.value : {};
            const arr = Array.isArray(data?.loaded) ? data.loaded : [];
            setLoadedDays(arr.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0));
        } finally {
            setLoadingDays(false);
        }
    }

    useEffect(() => {
        if (!canAccess) return;
        fetchLoadedDays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAccess]);

    async function uploadVotesCsv(f: File) {
        setUploading(true);
        try {
            const text = await f.text();
            const found = findHeaderAndDelimiter(text);

            if (!found) {
                throw new Error(
                    "Header non trovato nel CSV voti.\nMi aspetto una colonna ID (Cod./Id/#) e una colonna Voto (Voto/V/MV)."
                );
            }

            const { headerIndex, delimiter, lines } = found;

            // scarta tutto prima dell’header (nel CSV Fantacalcio.it c’è testo + nome squadra)
            const sliced = lines.slice(headerIndex).join("\n");

            const parsedRows = await new Promise<UploadRow[]>((resolve, reject) => {
                Papa.parse<CsvRow>(sliced, {
                    header: true,
                    skipEmptyLines: true,
                    delimiter,
                    transformHeader: (h) => h.trim(),
                    complete: (res) => {
                        const rows: CsvRow[] = (res.data ?? []).filter((r): r is CsvRow => Boolean(r));

                        const out = rows
                            .map((raw): UploadRow | null => {
                                const r = buildNormRow(raw);

                                const extIdVal = getFieldNorm(r, ID_KEYS);
                                const extId = toInt(extIdVal);
                                if (!extId) return null;

                                const voteRawVal = getFieldNorm(r, VOTE_KEYS);
                                const voteRaw = voteRawVal != null ? String(voteRawVal) : null;
                                const vote = toFloat(voteRawVal);

                                return {
                                    playerExtId: extId,
                                    voteRaw,
                                    vote: vote == null ? null : vote,
                                    gf: toInt(getFieldNorm(r, INT_KEYS.gf)) ?? 0,
                                    gs: toInt(getFieldNorm(r, INT_KEYS.gs)) ?? 0,
                                    rp: toInt(getFieldNorm(r, INT_KEYS.rp)) ?? 0,
                                    rs: toInt(getFieldNorm(r, INT_KEYS.rs)) ?? 0,
                                    rf: toInt(getFieldNorm(r, INT_KEYS.rf)) ?? 0,
                                    au: toInt(getFieldNorm(r, INT_KEYS.au)) ?? 0,
                                    amm: toInt(getFieldNorm(r, INT_KEYS.amm)) ?? 0,
                                    esp: toInt(getFieldNorm(r, INT_KEYS.esp)) ?? 0,
                                    ass: toInt(getFieldNorm(r, INT_KEYS.ass)) ?? 0,
                                };
                            })
                            .filter((x): x is UploadRow => x !== null);

                        if (!out.length) {
                            reject(new Error("CSV non valido: nessuna riga con Cod./Id valido."));
                            return;
                        }

                        resolve(out);
                    },
                    error: (err: unknown) => reject(err),
                });
            });

            const res = await fetch("/api/admin/matchdays/load", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ matchday, rows: parsedRows }),
            });

            const body = await readResponseBody(res);

            if (!res.ok) {
                console.error("upload endpoint error:", res.status, body);
                const msg =
                    body.kind === "json"
                        ? (body.value?.error ?? JSON.stringify(body.value))
                        : (body.value || "Upload fallito");
                throw new Error(`${res.status} ${res.statusText} - ${msg}`);
            }

            const data = body.kind === "json" ? body.value : {};
            alert(
                `OK! Giornata ${matchday}\nRicevute: ${data.received}\nUpsert: ${data.upserted}\nSkipped: ${data.skipped}\nPlayersFound: ${data.playersFound}`
            );

            await fetchLoadedDays();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Errore upload");
        } finally {
            setUploading(false);
        }
    }

    // ✅ Render (qui possiamo fare return liberamente)
    if (status === "loading") return <p>Caricamento...</p>;
    if (!session || !isAdmin) return <p>Accesso negato</p>;

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">Admin – Carica voti</h1>

            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="number"
                    min={1}
                    max={TOTAL_MATCHDAYS}
                    value={matchday}
                    onChange={(e) => setMatchday(Number(e.target.value))}
                    className="border px-2 py-1 rounded w-[90px]"
                    title="Giornata"
                />

                <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                />

                <button
                    className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                    disabled={!file || uploading}
                    onClick={() => file && uploadVotesCsv(file)}
                >
                    {uploading ? "Carico..." : "Carica voti"}
                </button>
            </div>

            <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                    <p className="font-semibold">Giornate (1–{TOTAL_MATCHDAYS})</p>

                    <button className="text-sm underline" onClick={fetchLoadedDays} disabled={loadingDays}>
                        {loadingDays ? "Aggiorno..." : "Aggiorna"}
                    </button>
                </div>

                <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-14 gap-2">
                    {Array.from({ length: TOTAL_MATCHDAYS }, (_, i) => i + 1).map((day) => {
                        const isLoaded = loadedSet.has(day);
                        return (
                            <div
                                key={day}
                                className={[
                                    "rounded-md border px-2 py-1 text-center text-sm font-medium",
                                    isLoaded
                                        ? "border-green-600 bg-green-100 text-green-800"
                                        : "border-gray-200 bg-white text-gray-500",
                                ].join(" ")}
                                title={isLoaded ? "Voti caricati" : "Non caricata"}
                            >
                                {day}
                            </div>
                        );
                    })}
                </div>

                <p className="text-sm text-gray-500">
                    Caricate: <span className="font-semibold">{loadedDays.length}</span> / {TOTAL_MATCHDAYS}
                </p>
            </div>
        </main>
    );
}
