"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import type { GameMode, PlayerFromDB } from "@/app/me/_lib/types";
import { CLASSIC_MODULE_DEFS, MODULES, computeTopFlopScoresByRole, pickBestLineup } from "@/app/me/_lib/lineup";

import Pitch from "@/app/me/_components/Pitch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function errMsg(e: unknown) {
    return e instanceof Error ? e.message : "Errore";
}

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

    // riallinea mode dal server (se cambia device/sessione)
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
            } catch {
                // ignore
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const moduleDefs = useMemo(() => (mode === "CLASSIC" ? CLASSIC_MODULE_DEFS : MODULES), [mode]);
    const [moduleName, setModuleName] = useState<string>(moduleDefs[0]?.name ?? (mode === "CLASSIC" ? "4-4-2" : "3-4-1-2"));

    useEffect(() => {
        if (!moduleDefs.some((m) => m.name === moduleName)) {
            setModuleName(moduleDefs[0]?.name ?? moduleName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const { scoreByRole, items, totalMatchdays } = useMemo(() => computeTopFlopScoresByRole(players, mode), [players, mode]);

    const moduleDef = useMemo(() => moduleDefs.find((m) => m.name === moduleName) ?? moduleDefs[0], [moduleDefs, moduleName]);

    const ideal = useMemo(() => {
        if (!moduleDef) return { selectable: false as const, lineup: [] };
        return pickBestLineup(players, scoreByRole, moduleDef, mode, { items, totalMatchdays });
    }, [players, scoreByRole, moduleDef, mode, items, totalMatchdays]);

    // piccolo hint se lista vuota
    useEffect(() => {
        if ((players ?? []).length === 0) toast.message("Non hai giocatori in rosa (o team non trovato).");
    }, [players]);

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
                            <b>MODULO NON SELEZIONABILE</b>: manca almeno un ruolo necessario (o non hai abbastanza giocatori disponibili).
                        </div>
                    ) : (
                        <Pitch lineup={ideal.lineup} mode={mode} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
