"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { GameMode } from "@/app/me/_lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function errMsg(e: unknown) {
    return e instanceof Error ? e.message : "Errore";
}

export default function GameModeCard({ initialGameMode }: { initialGameMode?: GameMode }) {
    const router = useRouter();
    const [mode, setMode] = useState<GameMode>(() => initialGameMode ?? "MANTRA");
    const [savingMode, setSavingMode] = useState(false);

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

    async function saveGameMode(next: GameMode) {
        if (next === mode) return;
        setSavingMode(true);
        try {
            const r = await fetch("/api/me/game-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameMode: next }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.error ?? "Salvataggio fallito");

            const gm = String(d?.gameMode ?? next).toUpperCase();
            if (gm === "MANTRA" || gm === "CLASSIC") setMode(gm as GameMode);
            else setMode(next);

            router.refresh();
            toast.success("Modalità salvata");
        } catch (e: unknown) {
            toast.error(errMsg(e));
        } finally {
            setSavingMode(false);
        }
    }

    return (
        <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
                <CardTitle>Modalità di gioco</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                    Seleziona <b>Mantra</b> o <b>Classic</b>. La scelta viene salvata sul tuo profilo e usata per ruoli/moduli.
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant={mode === "MANTRA" ? "default" : "outline"}
                        className="rounded-xl"
                        disabled={savingMode}
                        onClick={() => saveGameMode("MANTRA")}
                    >
                        Mantra
                    </Button>
                    <Button
                        type="button"
                        variant={mode === "CLASSIC" ? "default" : "outline"}
                        className="rounded-xl"
                        disabled={savingMode}
                        onClick={() => saveGameMode("CLASSIC")}
                    >
                        Classic
                    </Button>

                    {savingMode ? <span className="text-sm text-slate-500 self-center ml-2">Salvo…</span> : null}
                </div>
            </CardContent>
        </Card>
    );
}
