"use client";

import Link from "next/link";

import type { GameMode } from "@/app/me/_lib/types";
import type { PlayerFromDB } from "@/app/me/_lib/types";

import GameModeCard from "@/app/me/_components/cards/GameModeCard";
import TeamNameCard from "@/app/me/_components/cards/TeamNameCard";
import TheoreticalRankingCard from "@/app/me/_components/cards/TheoreticalRankingCard";
import IdealLineupCard from "@/app/me/_components/cards/IdealLineupCard";

export default function MeClient({
    email,
    teamName,
    players,
    initialPrediction,
    listoneTeams,
    initialGameMode,
}: {
    email: string;
    teamName: string;
    players: PlayerFromDB[];
    initialPrediction: string;
    listoneTeams: string[];
    initialGameMode?: GameMode;
}) {
    // Nota: qui non usiamo players/initialPrediction/listoneTeams, ma li lasciamo
    // per compatibilità con il tuo server wrapper. Se vuoi, poi “snelliamo” anche app/me/page.tsx.
    void players;
    void initialPrediction;
    void listoneTeams;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Profilo</h1>
                    <p className="mt-1 text-sm text-slate-600">Loggato come: {email}</p>
                </div>

                <Link
                    href="/team"
                    className="text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4"
                >
                    Vai al Team →
                </Link>
            </div>

            <GameModeCard initialGameMode={initialGameMode} />
            <TeamNameCard teamName={teamName} />
            <TheoreticalRankingCard />
            <IdealLineupCard />
        </div>
    );
}
