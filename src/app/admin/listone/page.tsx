"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, RefreshCw, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type GameMode = "MANTRA" | "CLASSIC";

type CertaintyLevel = "NONE" | "PROBABLE" | "SURE";
type PlayerGroup =
    | "TOP"
    | "SEMITOP"
    | "JOLLY"
    | "OTTIMO_TITOLARE"
    | "BUON_TITOLARE"
    | "DA_VOTO"
    | "EVITABILE";

type PlayerRow = {
    id: string;
    extId: number;
    name: string;
    team: string;
    roleMantra: string;
    roleClassic: string | null;
    price: number;
    group: PlayerGroup | null;
    rigorista: CertaintyLevel;
    calciPiazzati: CertaintyLevel;
    possibleSpend: number | null;
};

const GROUP_OPTIONS: { value: PlayerGroup; label: string }[] = [
    { value: "TOP", label: "Top" },
    { value: "SEMITOP", label: "SemiTop" },
    { value: "JOLLY", label: "Jolly" },
    { value: "OTTIMO_TITOLARE", label: "OttimoTitolare" },
    { value: "BUON_TITOLARE", label: "BuonTitolare" },
    { value: "DA_VOTO", label: "DaVoto" },
    { value: "EVITABILE", label: "Evitabile" },
];

function nextCertainty(v: CertaintyLevel): CertaintyLevel {
    if (v === "NONE") return "PROBABLE";
    if (v === "PROBABLE") return "SURE";
    return "NONE";
}

function CertaintyIcon({
    value,
    title,
    onClick,
    disabled,
}: {
    value: CertaintyLevel;
    title: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    if (value === "NONE") {
        return (
            <button
                type="button"
                title={title}
                onClick={onClick}
                disabled={disabled}
                className="h-8 w-10 rounded-md hover:bg-muted disabled:opacity-50"
            >
                <span className="text-muted-foreground">—</span>
            </button>
        );
    }

    if (value === "PROBABLE") {
        return (
            <button
                type="button"
                title={title}
                onClick={onClick}
                disabled={disabled}
                className="relative h-8 w-10 rounded-md hover:bg-muted disabled:opacity-50"
            >
                <span className="text-lg leading-none">⚽</span>
                <span className="absolute -top-1 -right-1 text-xs leading-none">❓</span>
            </button>
        );
    }

    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            className="h-8 w-10 rounded-md hover:bg-muted disabled:opacity-50"
        >
            <span className="text-lg leading-none">⚽</span>
        </button>
    );
}

/** ✅ Non usare mai res.json() "alla cieca" */
async function safeJson(res: Response) {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null; // HTML / testo non JSON
    }
}

export default function AdminListonePage() {
    const [file, setFile] = useState<File | null>(null);
    const [loadingUpload, setLoadingUpload] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);

    const [loadingTable, setLoadingTable] = useState(false);
    const [savingExtId, setSavingExtId] = useState<number | null>(null);
    const [gameMode, setGameMode] = useState<GameMode>("MANTRA");
    const [players, setPlayers] = useState<PlayerRow[]>([]);
    const [q, setQ] = useState("");

    const hasListone = players.length > 0;

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (!s) return players;
        return players.filter((p) => {
            return (
                p.name.toLowerCase().includes(s) ||
                p.team.toLowerCase().includes(s) ||
                String(p.extId).includes(s) ||
                (gameMode === "CLASSIC"
                    ? String(p.roleClassic ?? "").toLowerCase().includes(s)
                    : String(p.roleMantra ?? "").toLowerCase().includes(s))
            );
        });
    }, [players, q, gameMode]);

    async function loadAll() {
        setLoadingTable(true);
        try {
            const [gmRes, pRes] = await Promise.all([
                fetch("/api/me/game-mode", { cache: "no-store" }),
                fetch("/api/admin/players", { cache: "no-store" }),
            ]);

            const gmData = await safeJson(gmRes);
            if (
                gmRes.ok &&
                (gmData?.gameMode === "MANTRA" || gmData?.gameMode === "CLASSIC")
            ) {
                setGameMode(gmData.gameMode);
            }

            const pData = await safeJson(pRes);
            if (!pRes.ok) {
                throw new Error(pData?.error || `Impossibile caricare i giocatori (${pRes.status})`);
            }

            setPlayers(Array.isArray(pData?.players) ? pData.players : []);
        } catch (e: any) {
            toast.error(e?.message ?? "Errore caricamento tabella");
        } finally {
            setLoadingTable(false);
        }
    }

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function upload() {
        if (!file) return toast.error("Seleziona un file");

        setLoadingUpload(true);
        try {
            const fd = new FormData();
            fd.append("file", file);

            const res = await fetch("/api/admin/players/upload", {
                method: "POST",
                body: fd,
            });

            const data = await safeJson(res);
            if (!res.ok) {
                throw new Error(data?.error || `Upload fallito (${res.status})`);
            }

            toast.success(
                `OK: unique ${data?.uniqueByExtId ?? "?"} · upserted ${data?.upserted ?? "?"} · sep ${data?.separator ?? "?"}`
            );

            await loadAll();
        } catch (e: any) {
            toast.error(e?.message ?? "Errore upload");
        } finally {
            setLoadingUpload(false);
        }
    }

    async function resetAll() {
        const ok = window.confirm(
            "⚠️ RESET LISTONE ⚠️\n\nQuesta azione cancellerà:\n- giocatori\n- statistiche\n- rose\n\nL'operazione è IRREVERSIBILE.\n\nVuoi continuare?"
        );
        if (!ok) return;

        setLoadingReset(true);
        try {
            const res = await fetch("/api/admin/listone/reset", {
                method: "POST",
            });

            const data = await safeJson(res);
            if (!res.ok) {
                throw new Error(data?.error || `Reset fallito (${res.status})`);
            }

            toast.success(
                `Reset OK ✔️\nGiocatori: ${data?.deleted?.players ?? 0}\nStats: ${data?.deleted?.stats ?? 0}\nRose: ${data?.deleted?.teamPlayers ?? 0}`
            );

            setPlayers([]);
        } catch (e: any) {
            toast.error(e?.message ?? "Errore reset");
        } finally {
            setLoadingReset(false);
        }
    }

    async function patchPlayerMeta(
        extId: number,
        patch: Partial<Pick<PlayerRow, "group" | "rigorista" | "calciPiazzati" | "possibleSpend">>
    ) {
        setSavingExtId(extId);
        try {
            const res = await fetch("/api/admin/players/meta", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ extId, ...patch }),
            });

            const data = await safeJson(res);
            if (!res.ok) {
                throw new Error(data?.error || `Salvataggio fallito (${res.status})`);
            }

            setPlayers((prev) =>
                prev.map((p) => (p.extId === extId ? { ...p, ...patch } : p))
            );
        } catch (e: any) {
            toast.error(e?.message ?? "Errore salvataggio");
        } finally {
            setSavingExtId(null);
        }
    }

    return (
        <div className="mx-auto max-w-6xl p-6 space-y-6">
            {/* CARD UPLOAD/RESET */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <CardTitle>Admin · Listone giocatori</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Flusso consigliato: <b>Reset</b> (una sola volta) → carica listone → carica voti.
                    </div>

                    <div className="rounded-xl bg-muted p-4">
                        <Button
                            variant="destructive"
                            className="w-full bg-red-600 hover:bg-red-700 text-white"
                            onClick={resetAll}
                            disabled={loadingReset || loadingUpload || loadingTable}
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {loadingReset ? "Reset in corso…" : "RESET LISTONE"}
                        </Button>

                        <div className="mt-2 text-xs text-muted-foreground text-center">
                            Cancella <b>giocatori</b>, <b>statistiche</b> e <b>rose</b>
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">File listone</div>
                        <Input
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                    </div>

                    <Button
                        onClick={upload}
                        disabled={loadingUpload || loadingReset || loadingTable || !file}
                        className="w-full"
                    >
                        {loadingUpload ? "Caricamento…" : "Carica listone"}
                    </Button>

                    <div className="text-xs text-muted-foreground">
                        Se il listone contiene testo prima dell’header, verrà ignorato automaticamente.
                    </div>
                </CardContent>
            </Card>

            {/* CARD TABELLA LISTONE (solo se caricato) */}
            {hasListone && (
                <Card className="rounded-2xl">
                    <CardHeader className="gap-2">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <CardTitle>Listone caricato</CardTitle>

                            <div className="flex items-center gap-2">
                                <div className="text-xs text-muted-foreground">
                                    Modalità: <b>{gameMode}</b>
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={loadAll}
                                    disabled={loadingTable || loadingUpload || loadingReset}
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {loadingTable ? "Aggiorno…" : "Aggiorna"}
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Cerca per nome, squadra, ruolo o extId…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                            />
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                                {filtered.length}/{players.length}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent>
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr className="text-left">
                                        <th className="p-3 whitespace-nowrap">Ruolo</th>
                                        <th className="p-3 whitespace-nowrap">Nome</th>
                                        <th className="p-3 whitespace-nowrap">Squadra</th>
                                        <th className="p-3 whitespace-nowrap">Quotazione</th>
                                        <th className="p-3 whitespace-nowrap">Gruppo</th>
                                        <th className="p-3 whitespace-nowrap text-center">Rigorista</th>
                                        <th className="p-3 whitespace-nowrap text-center">Calci piazzati</th>
                                        <th className="p-3 whitespace-nowrap">Possibile spesa</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filtered.map((p) => {
                                        const role =
                                            gameMode === "CLASSIC"
                                                ? p.roleClassic ?? "-"
                                                : p.roleMantra ?? "-";

                                        const saving = savingExtId === p.extId;

                                        return (
                                            <tr key={p.id} className="border-t">
                                                <td className="p-3 whitespace-nowrap font-medium">{role}</td>
                                                <td className="p-3 whitespace-nowrap">{p.name}</td>
                                                <td className="p-3 whitespace-nowrap">{p.team}</td>
                                                <td className="p-3 whitespace-nowrap">{p.price ?? 0}</td>

                                                <td className="p-3 whitespace-nowrap">
                                                    <select
                                                        className="h-9 rounded-md border bg-background px-2 text-sm"
                                                        value={p.group ?? ""}
                                                        disabled={saving}
                                                        onChange={(e) => {
                                                            const v = e.target.value as PlayerGroup | "";
                                                            patchPlayerMeta(p.extId, {
                                                                group: v ? (v as PlayerGroup) : null,
                                                            });
                                                        }}
                                                    >
                                                        <option value="">—</option>
                                                        {GROUP_OPTIONS.map((opt) => (
                                                            <option key={opt.value} value={opt.value}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>

                                                <td className="p-3 whitespace-nowrap text-center">
                                                    <CertaintyIcon
                                                        value={p.rigorista ?? "NONE"}
                                                        title="Clicca per cambiare (nessuno → probabile → sicuro)"
                                                        disabled={saving}
                                                        onClick={() =>
                                                            patchPlayerMeta(p.extId, {
                                                                rigorista: nextCertainty(p.rigorista ?? "NONE"),
                                                            })
                                                        }
                                                    />
                                                </td>

                                                <td className="p-3 whitespace-nowrap text-center">
                                                    <CertaintyIcon
                                                        value={p.calciPiazzati ?? "NONE"}
                                                        title="Clicca per cambiare (nessuno → probabile → sicuro)"
                                                        disabled={saving}
                                                        onClick={() =>
                                                            patchPlayerMeta(p.extId, {
                                                                calciPiazzati: nextCertainty(p.calciPiazzati ?? "NONE"),
                                                            })
                                                        }
                                                    />
                                                </td>

                                                <td className="p-3 whitespace-nowrap">
                                                    {p.possibleSpend == null ? "—" : p.possibleSpend}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {filtered.length === 0 && (
                                        <tr>
                                            <td className="p-4 text-muted-foreground" colSpan={8}>
                                                Nessun giocatore trovato.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground">
                            * Icone: — = no, ⚽❓ = probabile, ⚽ = sicuro. (Clicca per ciclare)
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
