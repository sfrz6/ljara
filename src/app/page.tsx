import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session?.kind === "tenant") redirect("/portal");
  if (session?.kind === "staff") redirect(session.user.role === "platform_admin" ? "/platform" : "/dashboard");
  redirect("/login");
}
