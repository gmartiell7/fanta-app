export const CLASSIC_ROLES = new Set(["P", "D", "C", "A"]);

// quelli che mi hai detto (nota: "PC" nel csv, noi lo accettiamo)
export const MANTRA_ROLES = new Set([
	"Por", "Dd", "Ds", "Dc", "B", "M", "E", "C", "T", "W", "A", "Pc",
]);

export function normalizeClassicRole(input: unknown): string | null {
	const v = String(input ?? "").trim().toUpperCase();
	if (!v) return null;
	return CLASSIC_ROLES.has(v) ? v : null;
}

/**
 * Ritorna RM identico (trim + normalizzazione minima spazi),
 * ma valida che ogni ruolo (split su ;) sia nella whitelist.
 * Se non valido -> torna null (così decidi tu se scartare o accettare lo stesso).
 */
export function readMantraRMRaw(input: unknown): { raw: string; valid: boolean; roles: string[] } {
	const raw = String(input ?? "").trim();
	if (!raw) return { raw: "", valid: false, roles: [] };

	// split su ; e trim spazi
	const roles = raw.split(";").map((s) => s.trim()).filter(Boolean);

	const valid = roles.length > 0 && roles.every((r) => MANTRA_ROLES.has(r));
	return { raw, valid, roles };
}
