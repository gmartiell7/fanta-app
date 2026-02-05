"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function AdminCalendarioPage() {
    const [calendarFile, setCalendarFile] = useState<File | null>(null);
    const [season, setSeason] = useState("2025-2026");
    const [loadingCalendar, setLoadingCalendar] = useState(false);

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
                    <CardTitle>Admin · Calendario Serie A</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Carica il CSV calendario: <b>Match Number, Round Number, Date, Location, Home Team, Away Team, Result</b>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">Stagione</div>
                        <Input
                            value={season}
                            onChange={(e) => setSeason(e.target.value)}
                            placeholder="es. 2025-2026"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">File calendario</div>
                        <Input
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={(e) => setCalendarFile(e.target.files?.[0] ?? null)}
                        />
                    </div>

                    <Button onClick={uploadCalendar} disabled={loadingCalendar || !calendarFile} className="w-full">
                        <CalendarPlus className="mr-2 h-4 w-4" />
                        {loadingCalendar ? "Caricamento…" : "Carica calendario"}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
