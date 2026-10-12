"use client";

import { useId, useRef, useState } from "react";
import { Camera, FileText, ImagePlus, X } from "lucide-react";
import { Button } from "./button";
import { useI18n } from "../i18n-provider";

/** Downscale and re-encode a photo on the phone so uploads stay small on mobile data (proposal D12). */
async function compressImage(file: File, maxEdge = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/**
 * Photo picker for the form. Selected files are placed back into the real <input type=file> through a
 * DataTransfer so the server action receives them as normal form data. Camera capture works on phones.
 */
export function PhotoPicker({ name = "photos", max = 5, label }: { name?: string; max?: number; label?: string }) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function sync(next: File[]) {
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (input.current) input.current.files = dt.files;
    setFiles(next);
  }

  async function onPick(list: FileList | null) {
    if (!list) return;
    setBusy(true);
    const picked = await Promise.all(Array.from(list).map((f) => compressImage(f)));
    await sync([...files, ...picked].slice(0, max));
    setBusy(false);
  }

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label ?? t("common.photos")}</p>
      <input ref={input} id={id} name={name} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden />
      <div className="flex flex-wrap gap-2.5">
        {files.map((f, i) => (
          <div key={i} className="relative size-20 overflow-hidden rounded-md border border-line bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => sync(files.filter((_, k) => k !== i))} className="absolute end-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t("common.remove")}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {files.length < max ? (
          <>
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong bg-surface-2 text-[11.5px] font-medium text-ink-2 hover:bg-canvas">
              <Camera className="size-5" aria-hidden />
              {t("common.take_photo")}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }} />
            </label>
            <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong bg-surface-2 text-[11.5px] font-medium text-ink-2 hover:bg-canvas">
              <ImagePlus className="size-5" aria-hidden />
              {t("common.add_photos")}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }} />
            </label>
          </>
        ) : null}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">{busy ? t("common.loading") : t("common.photos_hint")}</p>
    </div>
  );
}

/** Single document picker (ID card, signed contract, cheque scan). */
export function DocumentPicker({ name, label, accept = "application/pdf,image/jpeg,image/png", hint }: { name: string; label: string; accept?: string; hint?: string }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">
        {label} <span className="text-[12px] font-normal text-ink-3">({t("common.optional")})</span>
      </p>
      <div className="flex items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface-2 p-3">
        <FileText className="size-5 shrink-0 text-ink-3" aria-hidden />
        <div className="min-w-0 flex-1 text-[13.5px]">{file ? <span className="block truncate text-ink">{file.name}</span> : <span className="text-ink-3">{hint ?? "PDF, JPG, PNG, 10 MB"}</span>}</div>
        <Button variant="secondary" size="sm" onClick={() => ref.current?.click()}>
          {file ? t("common.replace") : t("common.choose_file")}
        </Button>
        {file ? (
          <button
            type="button"
            className="text-ink-3 hover:text-ink"
            aria-label={t("common.remove")}
            onClick={() => {
              setFile(null);
              if (ref.current) ref.current.value = "";
            }}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <input ref={ref} name={name} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}
