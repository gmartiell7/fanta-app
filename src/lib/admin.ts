export const ADMIN_EMAILS = [
    "admin@fanta.it",
    "raffy@email.it",
    "test2@fanta.it",
].map((e) => e.toLowerCase());

export function isAdminEmail(email?: string | null) {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}
