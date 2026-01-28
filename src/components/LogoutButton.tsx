"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
    return (
        <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="
        inline-flex items-center gap-2
        rounded-xl px-3 py-2 text-sm font-medium
        bg-white/10 hover:bg-white/15
        border border-white/10 hover:border-white/20
        transition-all duration-200
        active:scale-[0.98]
      "
            aria-label="Logout"
            title="Logout"
        >
            <span className="opacity-90">Logout</span>
            <span className="opacity-70">⤴</span>
        </button>
    );
}
