"use client";

import { useEffect, useState } from "react";
import NavLink from "@/components/NavLink";
import clsx from "clsx";

type LinkItem = { href: string; label: string };

export default function MobileMenu({
    mainLinks,
    adminLinks,
    isAdmin,
}: {
    mainLinks: LinkItem[];
    adminLinks: LinkItem[];
    isAdmin: boolean;
}) {
    const [open, setOpen] = useState(false);

    // chiude su ESC
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // blocca scroll quando aperto (mobile UX)
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    return (
        <div className="md:hidden">
            {/* Hamburger */}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={open ? "Chiudi menu" : "Apri menu"}
                aria-expanded={open}
                className="
          inline-flex items-center justify-center
          rounded-xl px-3 py-2
          bg-white/5 hover:bg-white/10
          border border-white/10 hover:border-white/20
          transition-all duration-200
          active:scale-[0.98]
        "
            >
                <div className="relative h-4 w-6">
                    <span
                        className={clsx(
                            "absolute left-0 top-0 h-[2px] w-6 rounded-full bg-white transition-all duration-200",
                            open ? "translate-y-[7px] rotate-45" : ""
                        )}
                    />
                    <span
                        className={clsx(
                            "absolute left-0 top-[7px] h-[2px] w-6 rounded-full bg-white transition-all duration-200",
                            open ? "opacity-0" : "opacity-100"
                        )}
                    />
                    <span
                        className={clsx(
                            "absolute left-0 top-[14px] h-[2px] w-6 rounded-full bg-white transition-all duration-200",
                            open ? "translate-y-[-7px] -rotate-45" : ""
                        )}
                    />
                </div>
            </button>

            {/* Overlay + Panel */}
            <div
                className={clsx(
                    "fixed inset-0 z-[60] transition-opacity duration-200",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
            >
                {/* overlay */}
                <button
                    aria-label="Chiudi menu"
                    onClick={() => setOpen(false)}
                    className={clsx(
                        "absolute inset-0 bg-black/50",
                        "transition-opacity duration-200"
                    )}
                />

                {/* panel */}
                <div
                    className={clsx(
                        "absolute right-0 top-0 h-full w-[86%] max-w-[360px]",
                        "bg-slate-950 border-l border-white/10",
                        "p-4",
                        "transition-transform duration-200",
                        open ? "translate-x-0" : "translate-x-full"
                    )}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-white font-semibold">Menu</span>
                        <button
                            onClick={() => setOpen(false)}
                            className="rounded-xl px-3 py-2 text-white/80 hover:text-white hover:bg-white/10 transition"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="mt-4 space-y-4">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">
                                Navigazione
                            </div>
                            <div className="flex flex-col gap-3">
                                {mainLinks.map((l) => (
                                    <div key={l.href} onClick={() => setOpen(false)}>
                                        <NavLink href={l.href} label={l.label} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {isAdmin && (
                            <div className="pt-4 border-t border-white/10">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs uppercase tracking-wider text-white/50">
                                        Admin
                                    </div>
                                    <span className="rounded-lg bg-emerald-400/15 px-2 py-0.5 text-emerald-300 text-xs border border-emerald-400/20">
                                        riservato
                                    </span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {adminLinks.map((l) => (
                                        <div key={l.href} onClick={() => setOpen(false)}>
                                            <NavLink href={l.href} label={l.label} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
