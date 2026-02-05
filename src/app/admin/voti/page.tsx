"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";

type UserWithRole = { role?: string };

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
    return String(v ?? "").trim();
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

function getField(r: CsvRow, keys: string[]) {
    for (const k of keys) {
        const val = r[k];
        if (val !== undefined && val !== null && String(val).trim() !== "") return val;
    }
    return undefined;
}

export default function AdminPage() {
    const { data: session, status } = useSession();
    const [file, setFile] = useState<File | null>(null);

    const [matchday, setMatchday] = useState<number>(1);

    const [loadedDays, setLoadedDays] = useState<number[]>([]);
    const [loadingDays, setLoadingDays] = useState(false);
    const [uploading, setUploading] = useState(false);

    if (status === "loading") return <p>Caricamento...</p>;

    const role = (session?.user as UserWithRole | undefined)?.role;
    if (!session || role !== "ADMIN") {
        return <p>Accesso negato</p>;
    }

    async function fetchLoadedDays() {
        setLoadingDays(true);
        try {
            const res = await fetch("/api/admin/matchdays/loaded", { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            setLoadedDays(Array.isArray(data.loaded) ? data.loaded : []);
        } finally {
            setLoadingDays(false);
        }
    }

    useEffect(() => {
        fetchLoadedDays();
    }, []);

    const loadedSet = useMemo(() => new Set(loadedDays), [loadedDays]);

    async function uploadVotesCsv(file: File) {
        setUploading(true);

        try {
            const parsed = await new Promise<UploadRow[]>((resolve, reject) => {
                Papa.parse<CsvRow>(file, {
                    header: true,
                    skipEmptyLines: true,
                    delimiter: "", // auto
                    transformHeader: (h) => h.trim(),
                    complete: (res) => {
                        const rows = (res.data ?? []).filter(Boolean);

                        // CSV voti: cerco colonne comuni:
                        // Id o #  -> extId
                        // Voto o V o MV -> voto
                        // Bonus/malus opzionali: Gf Gs Rp Rs Rf Au Amm Esp Ass
                        const out: UploadRow[] = rows
                            .map((r) => {
                                const extId = toInt(getField(r, ["Id", "#", "ID"]));
                                if (!extId) return null;

                                const voteRawVal = getField(r, ["Voto", "V", "MV"]);
                                const voteRaw = voteRawVal != null ? String(voteRawVal) : null;
                                const vote = toFloat(voteRawVal);

                                return {
                                    playerExtId: extId,
                                    voteRaw,
                                    vote: vote == null ? null : vote,
                                    gf: toInt(getField(r, ["Gf", "GF"])) ?? 0,
                                    gs: toInt(getField(r, ["Gs", "GS"])) ?? 0,
                                    rp: toInt(getField(r, ["Rp", "RP"])) ?? 0,
                                    rs: toInt(getField(r, ["Rs", "RS"])) ?? 0,
                                    rf: toInt(getField(r, ["Rf", "RF"])) ?? 0,
                                    au: toInt(getField(r, ["Au", "AU"])) ?? 0,
                                    amm: toInt(getField(r, ["Amm", "AMM"])) ?? 0,
                                    esp: toInt(getField(r, ["Esp", "ESP"])) ?? 0,
                                    ass: toInt(getField(r, ["Ass", "ASS"])) ?? 0,
                                };
                            })
                            .filter((x): x is UploadRow => !!x);

                        if (!out.length) reject(new Error("CSV non valido: nessuna riga con Id/# e Voto/V/MV"));
                        else resolve(out);
                    },
                    error: (err) => reject(err),
                });
            });

            const res = await fetch("/api/admin/matchdays/load", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ matchday, rows: parsed }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error ?? "Upload fallito");

            alert(
                `OK! Giornata ${matchday}\nRicevute: ${data.received}\nUpsert: ${data.upserted}\nSkipped: ${data.skipped}`
            );

            await fetchLoadedDays();
        } catch (e) {
            alert(e instanceof Error ? e.message : "Errore upload");
        } finally {
            setUploading(false);
        }
    }

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-2xl font-bold">Admin – Carica voto</h1>

            <div className="flex flex-wrap items-center gap-3">
                <input
                    type="number"
                    min={1}
                    max={38}
                    value={matchday}
                    onChange={(e) => setMatchday(Number(e.target.value))}
                    className="border px-2 py-1 rounded w-[90px]"
                    title="Giornata"
                />

                <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                />

                <button
                    className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                    disabled={!file || uploading}
                    onClick={() => file && uploadVotesCsv(file)}
                >
                    {uploading ? "Carico..." : "Carica voto"}
                </button>
            </div>

            {/* ✅ SOTTO AL PULSANTE: GIORNATE */}
            <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                    <p className="font-semibold">Giornate (1–{TOTAL_MATCHDAYS})</p>

                    <button
                        className="text-sm underline"
                        onClick={fetchLoadedDays}
                        disabled={loadingDays}
                    >
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
