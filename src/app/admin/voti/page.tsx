"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function AdminVotiPage() {
    const router = useRouter();
    const { data: session, status } = useSession();

    const isAdmin = (session?.user as any)?.isAdmin === true;
    const email = session?.user?.email ?? "";

    const [file, setFile] = useState<File | null>(null);
    const [matchday, setMatchday] = useState<string>("");
    const [loading, setLoading] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // 🔒 Guard: solo admin
    useEffect(() => {
        if (status === "loading") return;

        if (status !== "authenticated") {
            router.replace("/");
            return;
        }

        if (!isAdmin) {
            router.replace("/team");
        }
    }, [status, isAdmin, router]);

    async function upload() {
        if (!isAdmin) {
            toast.error("Non sei autorizzato");
            return;
        }
        if (!file) {
            toast.error("Seleziona un file");
            return;
        }

        setLoading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            if (matchday.trim()) fd.append("matchday", matchday.trim());

            const res = await fetch("/api/admin/stats/upload", {
                method: "POST",
                body: fd,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Upload fallito");

            toast.success(
                `OK: Giornata ${data.matchday} · Inserite ${data.inserted} · Non trovati ${data.notFoundPlayers}`
            );

            // UX: reset dopo successo
            setFile(null);
            setMatchday("");
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (e: any) {
            toast.error(e?.message ?? "Errore upload");
        } finally {
            setLoading(false);
        }
    }

    // Loading state (evita flicker)
    if (status === "loading") {
        return (
            <div className="mx-auto max-w-2xl px-4 py-6">
                <Card className="rounded-2xl shadow-sm border-slate-200">
                    <CardHeader className="space-y-1">
                        <CardTitle>Admin · Inserimento voti</CardTitle>
                        <div className="text-sm text-muted-foreground">Caricamento…</div>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    // Se non autenticato o non admin: l'effetto farà redirect (qui render minimo)
    if (status !== "authenticated" || !isAdmin) return null;

    return (
        <div className="mx-auto max-w-2xl px-4 py-6">
            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader className="space-y-2">
                    <CardTitle className="flex items-center justify-between gap-3">
                        <span>Admin · Inserimento voti</span>
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                            area riservata
                        </span>
                    </CardTitle>

                    <div className="text-sm text-muted-foreground">
                        Carica il file voti “sporco” (righe di testo + sezione squadra). Puoi inserire la
                        giornata manualmente oppure lasciare vuoto se nel file c’è “21ª giornata”.
                    </div>

                    {!!email && (
                        <div className="text-xs text-slate-600">
                            Loggato come: <span className="font-medium">{email}</span>
                        </div>
                    )}
                </CardHeader>

                <CardContent className="space-y-4">
                    <Separator />

                    <div className="grid gap-4">
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">Giornata (opzionale)</div>
                            <Input
                                value={matchday}
                                onChange={(e) => setMatchday(e.target.value)}
                                placeholder="es. 21"
                                inputMode="numeric"
                                className="rounded-xl"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">File voti</div>
                            <Input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.txt,.tsv"
                                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                className="rounded-xl"
                            />
                            {file && (
                                <div className="text-xs text-slate-600">
                                    Selezionato: <span className="font-medium">{file.name}</span>
                                </div>
                            )}
                        </div>

                        <Button
                            onClick={upload}
                            disabled={loading || !file}
                            className="w-full rounded-xl transition active:scale-[0.99]"
                        >
                            {loading ? "Caricamento..." : "Carica voti"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
