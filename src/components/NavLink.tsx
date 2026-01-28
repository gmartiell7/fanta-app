"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export default function NavLink({
    href,
    label,
}: {
    href: string;
    label: string;
}) {
    const pathname = usePathname();
    const active = pathname === href;

    return (
        <Link
            href={href}
            className={clsx(
                "group relative text-sm font-medium transition-colors duration-200",
                "text-white/80 hover:text-white",
                active && "text-white"
            )}
        >
            {label}
            <span
                className={clsx(
                    "pointer-events-none absolute -bottom-2 left-0 h-[2px] w-full rounded-full",
                    "bg-emerald-400/90",
                    "origin-left transition-transform duration-200",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                )}
            />
        </Link>
    );
}
