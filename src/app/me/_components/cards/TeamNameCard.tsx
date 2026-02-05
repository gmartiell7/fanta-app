"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function errMsg(e: unknown) {
    return e instanceof Error ? e.message : "Errore";
}

export default function TeamNameCard({ teamName }: { teamName: string }) {
    const [name, setName] = useState(teamName);
    const [saving, setSaving] = useState(false);

    async function saveTeamName() {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Inserisci un nome squadra");
            return;
        }

        setSaving(true);
        try {
            const res = await fetch("/api/team/name", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmed }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Salvataggio fallito");

            toast.success("Nome squadra salvato");
        } catch (e: unknown) {
            toast.error(errMsg(e) ?? "Errore salvataggio");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card className="rounded-2xl shadow-sm border-slate-200">
            <CardHeader>
                <CardTitle>Nome squadra</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">Scegli o modifica il nome della tua squadra.</div>
                <Separator />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Es. FC Raffy"
                        className="rounded-xl"
                        maxLength={40}
                    />
                    <Button onClick={saveTeamName} disabled={saving} className="rounded-xl active:scale-[0.99]">
                        {saving ? "Salvo..." : "Salva"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
