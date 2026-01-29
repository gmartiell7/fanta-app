export function isAdminEmail(email: string | null | undefined) {
    if (!email) return false;

    const admins = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

    return admins.includes(email.toLowerCase());
}
