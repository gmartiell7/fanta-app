export type CategoryKey = "scudetto" | "europa" | "tranquilla" | "salvezzaSoft" | "salvezzaHard";

export const CATEGORIES: { key: CategoryKey; title: string; count: number }[] = [
    { key: "scudetto", title: "Lotta scudetto", count: 3 },
    { key: "europa", title: "Lotta Europa", count: 4 },
    { key: "tranquilla", title: "Zona tranquilla", count: 6 },
    { key: "salvezzaSoft", title: "Lotta salvezza soft", count: 4 },
    { key: "salvezzaHard", title: "Lotta salvezza hard", count: 3 },
];

export type CatState = Record<CategoryKey, string[]>;

export function normTeamName(s: string) {
    return (s ?? "").trim();
}

export function emptyCatState(): CatState {
    return {
        scudetto: Array.from({ length: CATEGORIES.find((c) => c.key === "scudetto")!.count }, () => ""),
        europa: Array.from({ length: CATEGORIES.find((c) => c.key === "europa")!.count }, () => ""),
        tranquilla: Array.from({ length: CATEGORIES.find((c) => c.key === "tranquilla")!.count }, () => ""),
        salvezzaSoft: Array.from({ length: CATEGORIES.find((c) => c.key === "salvezzaSoft")!.count }, () => ""),
        salvezzaHard: Array.from({ length: CATEGORIES.find((c) => c.key === "salvezzaHard")!.count }, () => ""),
    };
}

export function flattenAllSelected(state: CatState) {
    return Object.values(state).flat().map(normTeamName).filter(Boolean);
}

export function buildPredictionTextFromCats(state: CatState) {
    const line = (label: string, arr: string[]) => `${label}: ${arr.map(normTeamName).filter(Boolean).join(", ")}`;

    return [
        line("SCUDETTO", state.scudetto),
        line("EUROPA", state.europa),
        line("TRANQUILLA", state.tranquilla),
        line("SALVEZZA_SOFT", state.salvezzaSoft),
        line("SALVEZZA_HARD", state.salvezzaHard),
    ].join("\n");
}

export function parsePredictionToCats(text: string): CatState {
    const base = emptyCatState();
    const t = String(text ?? "");

    const getList = (label: string) => {
        const re = new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "im");
        const m = t.match(re);
        if (!m || !m[1]) return [];
        return m[1].split(",").map((x) => x.trim()).filter(Boolean);
    };

    const sc = getList("SCUDETTO");
    const eu = getList("EUROPA");
    const tr = getList("TRANQUILLA");
    const ss = getList("SALVEZZA_SOFT");
    const sh = getList("SALVEZZA_HARD");

    base.scudetto = [...sc.slice(0, base.scudetto.length), ...base.scudetto].slice(0, base.scudetto.length);
    base.europa = [...eu.slice(0, base.europa.length), ...base.europa].slice(0, base.europa.length);
    base.tranquilla = [...tr.slice(0, base.tranquilla.length), ...base.tranquilla].slice(0, base.tranquilla.length);
    base.salvezzaSoft = [...ss.slice(0, base.salvezzaSoft.length), ...base.salvezzaSoft].slice(0, base.salvezzaSoft.length);
    base.salvezzaHard = [...sh.slice(0, base.salvezzaHard.length), ...base.salvezzaHard].slice(0, base.salvezzaHard.length);

    return base;
}
