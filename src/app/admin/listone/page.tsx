"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, CalendarPlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function AdminListonePage() {
    const [file, setFile] = useState<File | null>(null);
    const [loadingUpload, setLoadingUpload] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);

    // ✅ calendario
    const [calendarFile, setCalendarFile] = useState<File | null>(null);
    const [season, setSeason] = useState("2025-2026");
    const [loadingCalendar, setLoadingCalendar] = useState(false);

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

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Upload fallito");

            toast.success(
                `OK: unique ${data.uniqueByExtId ?? "?"} · upserted ${data.upserted ?? "?"} · sep ${data.separator ?? "?"}`
            );
        } catch (e: any) {
            toast.error(e.message ?? "Errore upload");
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

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Reset fallito");

            toast.success(
                `Reset OK ✔️\nGiocatori: ${data.deleted?.players ?? 0}\nStats: ${data.deleted?.stats ?? 0}\nRose: ${data.deleted?.teamPlayers ?? 0}`
            );
        } catch (e: any) {
            toast.error(e.message ?? "Errore reset");
        } finally {
            setLoadingReset(false);
        }
    }

    async function uploadCalendar() {
        if (!calendarFile) return toast.error("Seleziona un file calendario");

        setLoadingCalendar(true);
        try {
            const fd = new FormData();
            fd.append("file", calendarFile);
            fd.append("season", season.trim());

            const res = await fetch("/api/admin/calendar/upload", {
                method: "POST",
                body: fd,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Upload calendario fallito");

            toast.success(`Calendario OK · Stagione ${data.season} · Inserite ${data.inserted}`);
            setCalendarFile(null);
        } catch (e: any) {
            toast.error(e.message ?? "Errore upload calendario");
        } finally {
            setLoadingCalendar(false);
        }
    }

    return (
        <div className="mx-auto max-w-2xl p-6 space-y-6">
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
                            disabled={loadingReset || loadingUpload || loadingCalendar}
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
                        <Input type="file" accept=".csv,.txt,.tsv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>

                    <Button onClick={upload} disabled={loadingUpload || loadingReset || loadingCalendar || !file} className="w-full">
                        {loadingUpload ? "Caricamento…" : "Carica listone"}
                    </Button>

                    <div className="text-xs text-muted-foreground">
                        Se il listone contiene testo prima dell’header, verrà ignorato automaticamente.
                    </div>
                </CardContent>
            </Card>

            {/* ✅ NUOVA CARD: calendario Serie A */}
            <Card className="rounded-2xl">
                <CardHeader>
                    <CardTitle>Admin · Calendario Serie A</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Carica il CSV calendario (come il tuo): <b>Match Number, Round Number, Date, Location, Home Team, Away Team, Result</b>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Stagione</div>
                        <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="es. 2025-2026" />
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">File calendario</div>
                        <Input
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={(e) => setCalendarFile(e.target.files?.[0] ?? null)}
                        />
                    </div>

                    <Button
                        onClick={uploadCalendar}
                        disabled={loadingCalendar || loadingReset || loadingUpload || !calendarFile}
                        className="w-full"
                    >
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        {loadingCalendar ? "Caricamento…" : "Carica calendario"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
