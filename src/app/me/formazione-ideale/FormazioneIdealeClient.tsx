"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import type { GameMode, PlayerFromDB } from "@/app/me/_lib/types";
import {
    CLASSIC_MODULE_DEFS,
    MODULES,
    computeTopFlopScoresByRole,
    pickBestLineup,
    pickBestLineupWhatIf,
    getSlotRanking,
    type LineupItem,
} from "@/app/me/_lib/lineup";

import Pitch from "@/app/me/_components/Pitch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function FormazioneIdealeClient({
    email,
    players,
    initialGameMode,
}: {
    email: string;
    players: PlayerFromDB[];
    initialGameMode?: GameMode;
}) {
    const [mode, setMode] = useState<GameMode>(() => initialGameMode ?? "MANTRA");
    const pitchRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await fetch("/api/me/game-mode", { cache: "no-store" });
                if (!r.ok) return;
                const d = await r.json();
                const gm = String(d?.gameMode ?? "MANTRA").toUpperCase();
                if (!alive) return;
                if (gm === "MANTRA" || gm === "CLASSIC") setMode(gm as GameMode);
            } catch { }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const moduleDefs = useMemo(() => (mode === "CLASSIC" ? CLASSIC_MODULE_DEFS : MODULES), [mode]);
    const [moduleName, setModuleName] = useState<string>(
        moduleDefs[0]?.name ?? (mode === "CLASSIC" ? "4-4-2" : "3-4-1-2")
    );

    useEffect(() => {
        if (!moduleDefs.some((m) => m.name === moduleName)) {
            setModuleName(moduleDefs[0]?.name ?? moduleName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const { scoreByRole, items, totalMatchdays } = useMemo(
        () => computeTopFlopScoresByRole(players, mode),
        [players, mode]
    );

    const moduleDef = useMemo(
        () => moduleDefs.find((m) => m.name === moduleName) ?? moduleDefs[0],
        [moduleDefs, moduleName]
    );

    const ideal = useMemo(() => {
        if (!moduleDef) return { selectable: false as const, lineup: [] as LineupItem[] };
        return pickBestLineup(players, scoreByRole, moduleDef, mode, { items, totalMatchdays });
    }, [players, scoreByRole, moduleDef, mode, items, totalMatchdays]);

    const [selected, setSelected] = useState<LineupItem | null>(null);

    // WHAT-IF state
    const [whatIf, setWhatIf] = useState<{ slotIndex: number; playerId: string } | null>(null);
    const [showWhatIf, setShowWhatIf] = useState(false);

    const whatIfResult = useMemo(() => {
        if (!moduleDef || !whatIf) return null;
        return pickBestLineupWhatIf(players, scoreByRole, moduleDef, mode, whatIf, { items, totalMatchdays });
    }, [players, scoreByRole, moduleDef, mode, items, totalMatchdays, whatIf]);

    const displayLineup = useMemo(() => {
        if (showWhatIf && whatIfResult?.selectable) return whatIfResult.lineup;
        return ideal.lineup;
    }, [ideal.lineup, showWhatIf, whatIfResult]);

    // reset selezione / what-if quando cambiano lineup/modulo
    useEffect(() => {
        if (selected) {
            const stillThere = ideal.lineup?.some(
                (x) => x.player.id === selected.player.id && x.slotIndex === selected.slotIndex
            );
            if (!stillThere) setSelected(null);
        }
        setWhatIf(null);
        setShowWhatIf(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [moduleName, mode]);

    const ranking = useMemo(() => {
        if (!selected) return [];
        return getSlotRanking(players, scoreByRole, selected.slot, mode, { items, totalMatchdays });
    }, [selected, players, scoreByRole, mode, items, totalMatchdays]);

    function focusPitch() {
        pitchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    useEffect(() => {
        if ((players ?? []).length === 0) toast.message("Non hai giocatori in rosa (o team non trovato).");
    }, [players]);

    const selectedPlayerId = selected?.player.id ?? null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Formazione ideale</h1>
                    <p className="mt-1 text-sm text-slate-600">Loggato come: {email}</p>
                </div>

                <Button asChild variant="outline" className="rounded-xl">
                    <Link href="/me">← Torna al profilo</Link>
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Formazione consigliata</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Scopri qual è la formazione ideale da inserire basandoci sulle statistiche dei tuoi giocatori.
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm font-medium text-slate-700">Modulo</div>
                        <select
                            value={moduleName}
                            onChange={(e) => setModuleName(e.target.value)}
                            className="w-full sm:w-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                            {moduleDefs.map((m) => (
                                <option key={m.name} value={m.name}>
                                    {m.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {!ideal.selectable ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                            <b>MODULO NON SELEZIONABILE</b>: manca almeno un ruolo necessario.
                        </div>
                    ) : (
                        <>
                            {whatIf && (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-slate-700">
                                            <b>WHAT-IF</b> attivo sullo slot <b>#{whatIf.slotIndex + 1}</b>
                                            {selected ? (
                                                <>
                                                    {" "}
                                                    (<b>{selected.slot}</b>)
                                                </>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant={showWhatIf ? "default" : "outline"}
                                                className="rounded-xl"
                                                onClick={() => setShowWhatIf(true)}
                                                disabled={!whatIfResult?.selectable}
                                            >
                                                Mostra simulazione
                                            </Button>
                                            <Button
                                                variant={!showWhatIf ? "default" : "outline"}
                                                className="rounded-xl"
                                                onClick={() => setShowWhatIf(false)}
                                            >
                                                Mostra reale
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => {
                                                    setWhatIf(null);
                                                    setShowWhatIf(false);
                                                }}
                                            >
                                                Reset
                                            </Button>
                                        </div>
                                    </div>

                                    {whatIfResult && !whatIfResult.selectable && (
                                        <div className="mt-2 text-rose-700">
                                            Simulazione non selezionabile (giocatore non compatibile o conflitti di disponibilità).
                                        </div>
                                    )}
                                </div>
                            )}

                            <div ref={pitchRef}>
                                <Pitch
                                    lineup={displayLineup}
                                    mode={mode}
                                    selectedPlayerId={selectedPlayerId}
                                    onPick={(it) => {
                                        setSelected(it);
                                        setWhatIf(null);
                                        setShowWhatIf(false);
                                        focusPitch();
                                    }}
                                />
                            </div>
                        </>
                    )}

                    {ideal.selectable && selected && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                        Graduatoria slot: {selected.slot} (slot #{selected.slotIndex + 1})
                                    </div>
                                    <div className="text-xs text-slate-600">
                                        Selezionato: <b>{selected.player.name}</b> ({selected.usedRole})
                                    </div>
                                </div>
                                <Button variant="outline" className="rounded-xl" onClick={() => setSelected(null)}>
                                    Chiudi
                                </Button>
                            </div>

                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-slate-600">
                                            <th className="py-2 pr-3">#</th>
                                            <th className="py-2 pr-3">Giocatore</th>
                                            <th className="py-2 pr-3">Squadra</th>
                                            <th className="py-2 pr-3">Ruoli</th>
                                            <th className="py-2 pr-3">Score</th>
                                            <th className="py-2 pr-3">What-if</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ranking.slice(0, 30).map((r, idx) => {
                                            const active = r.player.id === selected.player.id;
                                            const isWhatIf = whatIf?.playerId === r.player.id && whatIf?.slotIndex === selected.slotIndex;
                                            const inCurrentLineup = ideal.lineup.some((x) => x.player.id === r.player.id);

                                            return (
                                                <tr
                                                    key={r.player.id}
                                                    className={[
                                                        "cursor-pointer",
                                                        active ? "bg-slate-100" : "hover:bg-slate-50",
                                                    ].join(" ")}
                                                    onClick={() => {
                                                        // click riga: seleziona sul campo se è in lineup corrente
                                                        const li = ideal.lineup.find((x) => x.player.id === r.player.id);
                                                        if (li) {
                                                            setSelected(li);
                                                            setWhatIf(null);
                                                            setShowWhatIf(false);
                                                            focusPitch();
                                                        } else {
                                                            // non è in campo: attiva what-if sullo slot selezionato
                                                            setWhatIf({ slotIndex: selected.slotIndex, playerId: r.player.id });
                                                            setShowWhatIf(true);
                                                            focusPitch();
                                                        }
                                                    }}
                                                >
                                                    <td className="py-2 pr-3">{idx + 1}</td>
                                                    <td className="py-2 pr-3 font-medium text-slate-900">{r.player.name}</td>
                                                    <td className="py-2 pr-3 text-slate-700">{r.player.team}</td>
                                                    <td className="py-2 pr-3 text-slate-700">{r.matchedRoles.join("/")}</td>
                                                    <td className="py-2 pr-3 tabular-nums">{Math.round(r.score * 100) / 100}</td>
                                                    <td className="py-2 pr-3">
                                                        <Button
                                                            size="sm"
                                                            variant={isWhatIf ? "default" : "outline"}
                                                            className="rounded-xl"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setWhatIf({ slotIndex: selected.slotIndex, playerId: r.player.id });
                                                                setShowWhatIf(true);
                                                                focusPitch();
                                                            }}
                                                        >
                                                            {inCurrentLineup ? "In campo" : "Prova"}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-2 text-xs text-slate-500">
                                * Click su un giocatore “fuori” → avvia la simulazione What-if sullo slot selezionato.
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
