"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, User, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS = { home: Home, calendar: CalendarDays, wrench: Wrench, user: User };

/** Thumb reach bottom navigation for the tenant portal. Respects the iPhone home indicator. */
export function PortalNav({ items }: { items: { href: string; label: string; icon: keyof typeof ICONS }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface">
      <ul className="mx-auto flex max-w-2xl">
        {items.map((it) => {
          const Icon = ICONS[it.icon];
          const active = it.href === "/portal" ? pathname === "/portal" : pathname.startsWith(it.href);
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[12px] font-medium", active ? "text-brand-800" : "text-ink-3")}>
                <Icon className="size-[22px]" aria-hidden />
                {it.label}
                {active ? <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brass-500" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
