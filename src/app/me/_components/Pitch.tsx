"use client";

import { useMemo } from "react";
import type { GameMode } from "@/app/me/_lib/types";
import type { LineupItem } from "@/app/me/_lib/lineup";
import { getLineGroup } from "@/app/me/_lib/lineup";

function PlayerChip({
    slot,
    usedRole,
    name,
    team,
    score,
    selected,
    onClick,
}: {
    slot: string;
    usedRole: string;
    name: string;
    team: string;
    score: number;
    selected?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "w-full max-w-[240px] text-left",
                "rounded-2xl bg-white/10 backdrop-blur border border-white/15",
                "px-3 py-2 shadow-sm",
                "transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                selected ? "ring-2 ring-white/80" : "",
            ].join(" ")}
            title={`${name} (${team})`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold text-white/80">
                    {slot} <span className="text-white/50">→</span> {usedRole}
                </div>
                <div className="text-[11px] text-white/70 tabular-nums">
                    {Number.isInteger(score) ? score : score.toFixed(1)}
                </div>
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white truncate">{name}</div>
            <div className="text-[11px] text-white/75 truncate">{team}</div>
        </button>
    );
}

export default function Pitch({
    lineup,
    mode,
    onPick,
    selectedPlayerId,
}: {
    lineup: LineupItem[];
    mode: GameMode;
    onPick?: (it: LineupItem) => void;
    selectedPlayerId?: string | null;
}) {
    const grouped = useMemo(() => {
        const g: Record<string, typeof lineup> = { ATT: [], AM: [], MID: [], DEF: [], GK: [] };
        for (const x of lineup) {
            const k = getLineGroup(x.slot, mode);
            (g[k] ?? (g[k] = [])).push(x);
        }
        return [
            { key: "ATT", label: "Attacco", items: g.ATT },
            { key: "AM", label: "Trequarti", items: g.AM },
            { key: "MID", label: "Centrocampo", items: g.MID },
            { key: "DEF", label: "Difesa", items: g.DEF },
            { key: "GK", label: "Portiere", items: g.GK },
        ].filter((x) => x.items.length > 0);
    }, [lineup, mode]);

    return (
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
            <div className="relative h-[560px] w-full bg-emerald-700">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-700 to-emerald-800 opacity-90" />
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:72px_72px]" />
                </div>

                <div className="absolute inset-6 rounded-2xl border-2 border-white/35" />
                <div className="absolute left-1/2 top-6 bottom-6 w-0 border-l-2 border-white/35" />
                <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />

                <div className="absolute left-1/2 top-6 h-20 w-56 -translate-x-1/2 border-2 border-white/35 rounded-b-2xl border-t-0" />
                <div className="absolute left-1/2 bottom-6 h-20 w-56 -translate-x-1/2 border-2 border-white/35 rounded-t-2xl border-b-0" />

                <div className="absolute inset-6 flex flex-col justify-between py-6">
                    {grouped.map((line) => {
                        const isMid = line.key === "MID";
                        const rowClass = ["flex items-center justify-center", "px-4 sm:px-6 gap-4 sm:gap-6", isMid ? "rotate-180" : ""].join(" ");

                        return (
                            <div key={line.key} className={rowClass}>
                                {line.items.map((x, idx) => (
                                    <div key={`${x.player.id}-${idx}-${x.slot}-${x.slotIndex}`} className={isMid ? "rotate-180" : ""}>
                                        <PlayerChip
                                            slot={x.slot}
                                            usedRole={x.usedRole}
                                            name={x.player.name}
                                            team={x.player.team}
                                            score={x.score}
                                            selected={Boolean(selectedPlayerId && selectedPlayerId === x.player.id)}
                                            onClick={() => onPick?.(x)}
                                        />
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">Campo · 11 titolari</div>
                    <div className="text-xs text-slate-500">Chip: Slot → Ruolo scelto · Score Top→Flop</div>
                </div>
            </div>
        </div>
    );
}
