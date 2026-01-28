import { ReactNode } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isAdminEmail } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
    const session = await getServerSession(authOptions);

    // non loggato
    if (!session?.user) redirect("/");

    // loggato ma non admin
    const email = session.user.email ?? "";
    if (!isAdminEmail(email)) redirect("/team");

    return <>{children}</>;
}
