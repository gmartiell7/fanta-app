"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useSession } from "next-auth/react";

const BASE_LINKS = [
    { href: "/", label: "Home" },
    { href: "/team", label: "Team" },
    { href: "/svincolati", label: "Svincolati" },
];

const ADMIN_LINK = { href: "/admin/listone", label: "Admin" };

export default function Navbar() {
    const pathname = usePathname();
    const { data: session, status } = useSession();

    const isAdmin = (session?.user as any)?.isAdmin === true;

    const links =
        status === "authenticated"
            ? isAdmin
                ? [...BASE_LINKS, ADMIN_LINK]
                : BASE_LINKS
            : [{ href: "/", label: "Home" }];

    return (
        <nav className="w-full bg-slate-900 text-white px-6 py-3 flex items-center gap-6">
            <span className="font-bold text-lg">⚽ Fanta App</span>

            <ul className="flex gap-4">
                {links.map((link) => (
                    <li key={link.href}>
                        <Link
                            href={link.href}
                            className={clsx(
                                "hover:text-yellow-400 transition",
                                pathname === link.href && "text-yellow-400 font-semibold"
                            )}
                        >
                            {link.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
