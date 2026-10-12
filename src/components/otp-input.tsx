"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Six box one-time code entry. Handles typing, backspace, paste and the iOS one-time-code autofill. */
export function OtpInput({ name = "code", invalid }: { name?: string; invalid?: boolean }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setAt(i: number, v: string) {
    setDigits((d) => d.map((x, k) => (k === i ? v : x)));
  }
  function onChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (v.length > 1) {
      const chars = v.slice(0, 6).split("");
      setDigits(Array.from({ length: 6 }, (_, k) => chars[k] ?? ""));
      refs.current[Math.min(chars.length, 5)]?.focus();
      return;
    }
    setAt(i, v);
    if (v && i < 5) refs.current[i + 1]?.focus();
  }
  return (
    <div dir="ltr" className="flex justify-center gap-2" role="group" aria-label="One-time code">
      <input type="hidden" name={name} value={digits.join("")} />
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          aria-label={`${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
          }}
          className={cn("size-12 rounded-sm border border-line-strong bg-surface text-center text-[22px] font-semibold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 md:size-11", invalid && "border-bad-600")}
        />
      ))}
    </div>
  );
}
