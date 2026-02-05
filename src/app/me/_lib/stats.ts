import type { StatRow } from "./types";

export function calcMvFromStats(stats: Pick<StatRow, "vote">[]): number | null {
    const votes = stats.map((s) => s.vote).filter((v): v is number => v !== null);
    if (votes.length === 0) return null;
    return votes.reduce((a, b) => a + b, 0) / votes.length;
}

export function calcFmvMatch(s: Omit<StatRow, "matchday">): number | null {
    if (s.vote === null) return null;

    return (
        s.vote +
        s.gf * 3 -
        s.gs * 1 +
        s.rp * 3 -
        s.rs * 3 +
        s.rf * 3 -
        s.au * 2 -
        s.amm * 0.5 -
        s.esp * 1 +
        s.ass * 1
    );
}

export function calcFmvFromStats(stats: Omit<StatRow, "matchday">[]): number | null {
    const fmvs = stats.map(calcFmvMatch).filter((v): v is number => v !== null);
    if (fmvs.length === 0) return null;
    return fmvs.reduce((a, b) => a + b, 0) / fmvs.length;
}
