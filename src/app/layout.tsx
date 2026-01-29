import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import NavbarServer from "@/components/NavbarServer";

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="it">
            <body className="min-h-screen bg-slate-100">
                <Providers>
                    {/* Navbar: appare solo se session esiste */}
                    <NavbarServer />

                    <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>

                    {/* Sonner Toaster (UNA SOLA VOLTA) */}
                    <Toaster richColors />
                </Providers>
            </body>
        </html>
    );
}
