"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import {
    CATEGORIES,
    type CategoryKey,
    type CatState,
    normTeamName,
    emptyCatState,
    flattenAllSelected,
    buildPredictionTextFromCats,
    parsePredictionToCats,
} from "@/app/me/_lib/prediction";

function errMsg(e: unknown) {
    return e instanceof Error ? e.message : "Errore";
}

export default function ClassificaTeoricaClient({
    email,
    initialPrediction,
    listoneTeams,
}: {
    email: string;
    initialPrediction: string;
    listoneTeams: string[];
}) {
    const [cats, setCats] = useState<CatState>(() => parsePredictionToCats(initialPrediction));
    const [predictionText, setPredictionText] = useState<string>(() =>
        buildPredictionTextFromCats(parsePredictionToCats(initialPrediction))
    );
    const [savingPrediction, setSavingPrediction] = useState(false);

    const teams = useMemo(() => {
        const cleaned = (listoneTeams ?? []).map(normTeamName).filter(Boolean);
        return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b, "it"));
    }, [listoneTeams]);

    const selectedAll = useMemo(() => new Set(flattenAllSelected(cats)), [cats]);

    function optionsFor(category: CategoryKey, index: number) {
        const current = normTeamName(cats[category]?.[index] ?? "");
        return teams.filter((t) => {
            const nt = normTeamName(t);
            if (nt === current) return true;
            return !selectedAll.has(nt);
        });
    }

    function setTeamInCat(category: CategoryKey, index: number, value: string) {
        const v = normTeamName(value);

        setCats((prev) => {
            const next: CatState = {
                scudetto: [...prev.scudetto],
                europa: [...prev.europa],
                tranquilla: [...prev.tranquilla],
                salvezzaSoft: [...prev.salvezzaSoft],
                salvezzaHard: [...prev.salvezzaHard],
            };

            next[category][index] = v;

            if (v) {
                (Object.keys(next) as CategoryKey[]).forEach((k) => {
                    next[k] = next[k].map((x, i) => {
                        if (k === category && i === index) return x;
                        return normTeamName(x) === v ? "" : x;
                    });
                });
            }

            return next;
        });
    }

    useEffect(() => {
        setPredictionText(buildPredictionTextFromCats(cats));
    }, [cats]);

    async function savePrediction() {
        const chosen = flattenAllSelected(cats);
        const unique = new Set(chosen);

        if (chosen.length !== 20) {
            toast.error("Completa tutte le scelte: devono essere 20 squadre totali.");
            return;
        }
        if (unique.size !== 20) {
            toast.error("Ci sono squadre duplicate tra le categorie.");
            return;
        }

        const text = buildPredictionTextFromCats(cats).trim();
        if (!text) {
            toast.error("Inserisci la classifica teorica");
            return;
        }

        setSavingPrediction(true);
        try {
            const res = await fetch("/api/me/prediction", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data?.error ?? "Salvataggio fallito");

            toast.success("Classifica salvata");
        } catch (e: unknown) {
            toast.error(errMsg(e) ?? "Errore salvataggio");
        } finally {
            setSavingPrediction(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Classifica teorica</h1>
                    <p className="mt-1 text-sm text-slate-600">Loggato come: {email}</p>
                </div>

                <Button asChild variant="outline" className="rounded-xl">
                    <Link href="/me">← Torna al profilo</Link>
                </Button>
            </div>

            <Card className="rounded-2xl shadow-sm border-slate-200">
                <CardHeader>
                    <CardTitle>Impostazioni</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        Seleziona le squadre del listone (CSV) nelle 5 categorie. Una squadra scelta sparisce da tutte le altre select.
                    </div>

                    <Separator />

                    {teams.length === 0 ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Non trovo squadre nel listone. Controlla import CSV e campo <b>team</b> sul Player.
                        </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                        {CATEGORIES.map((cat) => (
                            <div key={cat.key} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-base font-semibold text-slate-900">{cat.title}</div>
                                    <div className="text-xs text-slate-500">{cat.count} squadre</div>
                                </div>

                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {cats[cat.key].map((val, idx) => {
                                        const opts = optionsFor(cat.key, idx);
                                        return (
                                            <div key={`${cat.key}-${idx}`} className="rounded-xl border border-slate-200 p-3">
                                                <div className="text-sm font-semibold text-slate-800">{idx + 1}ª scelta</div>
                                                <select
                                                    value={val}
                                                    onChange={(e) => setTeamInCat(cat.key, idx, e.target.value)}
                                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                                >
                                                    <option value="">— seleziona —</option>
                                                    {opts.map((t) => (
                                                        <option key={t} value={t}>
                                                            {t}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="mt-1 text-xs text-slate-500">Disponibili: {opts.length}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-1">
                        <div className="text-xs text-slate-500 mb-2">Formato salvato (parsabile):</div>
                        <textarea
                            value={predictionText}
                            readOnly
                            className="min-h-[150px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => setCats(emptyCatState())}
                        >
                            Reset
                        </Button>

                        <Button onClick={savePrediction} disabled={savingPrediction} className="rounded-xl active:scale-[0.99]">
                            {savingPrediction ? "Salvo..." : "Salva classifica"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
