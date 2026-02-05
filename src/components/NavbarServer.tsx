import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import NavLink from "@/components/NavLink";
import LogoutButton from "@/components/LogoutButton";
import MobileMenu from "@/components/MobileMenu";

const MAIN_LINKS = [
    { href: "/team", label: "Team" },
    { href: "/logica", label: "Logica" },
    { href: "/svincolati", label: "Svincolati" },
];

const ADMIN_LINKS = [
    { href: "/admin/listone", label: "Inserimento listone" },
    { href: "/admin/calendario", label: "Inserimento calendario" },
    { href: "/admin/voti", label: "Inserimento voti" },
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NavbarServer() {
    const session = await getServerSession(authOptions);

    // Navbar solo dopo login
    if (!session?.user) return null;

    const email = session.user.email ?? "";
    const isAdmin = (session.user as any)?.isAdmin === true;

    return (
        <header className="sticky top-0 z-50">
            <div className="bg-slate-950/90 backdrop-blur border-b border-white/10">
                <div className="mx-auto max-w-6xl px-4">
                    <div className="flex h-14 items-center justify-between">
                        {/* BRAND */}
                        <Link
                            href="/me"
                            className="
                flex items-center gap-2
                text-white font-semibold
                transition-transform duration-200
                hover:scale-[1.03]
                active:scale-[0.98]
              "
                        >
                            <span>⚽</span>
                            <span className="tracking-tight">Fanta</span>
                            <span className="text-white/50 text-sm font-medium">dashboard</span>
                        </Link>

                        {/* DESKTOP NAV */}
                        <nav className="hidden md:flex items-center gap-6">
                            <div className="flex items-center gap-6">
                                {MAIN_LINKS.map((l) => (
                                    <NavLink key={l.href} href={l.href} label={l.label} />
                                ))}
                            </div>

                            {isAdmin && (
                                <div className="flex items-center gap-4 pl-6 ml-2 border-l border-white/10">
                                    <span className="text-xs uppercase tracking-wider text-white/50">
                                        Admin
                                    </span>
                                    <div className="flex items-center gap-6">
                                        {ADMIN_LINKS.map((l) => (
                                            <NavLink key={l.href} href={l.href} label={l.label} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </nav>

                        {/* RIGHT */}
                        <div className="flex items-center gap-3">
                            {/* EMAIL (desktop) */}
                            <div
                                className="
                  hidden sm:flex items-center gap-2
                  rounded-xl px-3 py-2
                  bg-white/5 border border-white/10
                  text-sm text-white/80
                  transition-all duration-200
                  hover:bg-white/10
                "
                                title={email}
                            >
                                <span>👤</span>
                                <span className="max-w-[220px] truncate">{email}</span>
                                {isAdmin && (
                                    <span className="ml-1 rounded-lg bg-emerald-400/15 px-2 py-0.5 text-emerald-300 text-xs border border-emerald-400/20">
                                        admin
                                    </span>
                                )}
                            </div>

                            <LogoutButton />

                            {/* MOBILE MENU */}
                            <MobileMenu
                                mainLinks={MAIN_LINKS}
                                adminLinks={ADMIN_LINKS}
                                isAdmin={isAdmin}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
