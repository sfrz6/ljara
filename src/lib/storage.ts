import { and, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import { fileBlobs, files } from "@/db/schema";
import { DomainError } from "@/domain/errors";

/**
 * File storage abstraction. Two drivers:
 *   db    (default) bytes live in Postgres (file_blobs). Works on Vercel and locally with no extra service.
 *   blob  Vercel Blob, selected with STORAGE_DRIVER=blob and BLOB_READ_WRITE_TOKEN.
 * Files are never public: every download goes through /api/files/[id] which checks the session and the
 * organisation, so a leaked address opens nothing for a stranger (proposal G8).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type FileCategory = "id_doc" | "cheque_scan" | "contract" | "maintenance_photo" | "inspection_photo" | "logo" | "document";

const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "application/pdf", test: (b) => b.length > 4 && b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/webp", test: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

/** Detect the real type from the bytes. The client supplied MIME type is never trusted. */
export function sniffMime(data: Buffer): string | null {
  return SIGNATURES.find((s) => s.test(data))?.mime ?? null;
}

const ALLOWED: Record<FileCategory, string[]> = {
  id_doc: ["application/pdf", "image/jpeg", "image/png"],
  cheque_scan: ["application/pdf", "image/jpeg", "image/png"],
  contract: ["application/pdf", "image/jpeg", "image/png"],
  maintenance_photo: ["image/jpeg", "image/png", "image/webp"],
  inspection_photo: ["image/jpeg", "image/png", "image/webp"],
  logo: ["image/jpeg", "image/png", "image/webp"],
  document: ["application/pdf", "image/jpeg", "image/png"],
};

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "file";
}

function driver(): "db" | "blob" {
  return process.env.STORAGE_DRIVER === "blob" && process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "db";
}

export async function saveFile(
  db: DB,
  input: { orgId: string | null; name: string; data: Buffer; category: FileCategory; createdBy?: string | null },
): Promise<string> {
  if (input.data.length === 0) throw new DomainError("file_empty", {}, "file");
  if (input.data.length > MAX_FILE_BYTES) throw new DomainError("file_too_large", { mb: 10 }, "file");
  const mime = sniffMime(input.data);
  if (!mime || !ALLOWED[input.category].includes(mime)) throw new DomainError("file_type_not_allowed", {}, "file");

  const name = safeName(input.name);
  const drv = driver();
  let storageKey: string | null = null;
  if (drv === "blob") {
    const { put } = await import("@vercel/blob");
    const blob = await put(`ijara/${input.orgId ?? "platform"}/${name}`, input.data, {
      access: "public",
      addRandomSuffix: true,
      contentType: mime,
    });
    storageKey = blob.url;
  }
  const [row] = await db
    .insert(files)
    .values({
      orgId: input.orgId,
      name,
      mime,
      size: input.data.length,
      driver: drv,
      storageKey,
      category: input.category,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: files.id });
  if (drv === "db") await db.insert(fileBlobs).values({ fileId: row.id, data: input.data });
  return row.id;
}

export async function loadFileMeta(db: DB, fileId: string) {
  const [f] = await db.select().from(files).where(eq(files.id, fileId));
  return f ?? null;
}

export async function readFileBytes(db: DB, file: typeof files.$inferSelect): Promise<Buffer | null> {
  if (file.driver === "blob" && file.storageKey) {
    const res = await fetch(file.storageKey);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  const [b] = await db.select().from(fileBlobs).where(and(eq(fileBlobs.fileId, file.id)));
  return b ? Buffer.from(b.data) : null;
}
