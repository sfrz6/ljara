"use client";

import { useActionState, useState } from "react";
import Papa from "papaparse";
import { Download } from "lucide-react";
import { Card, CardBody, CardHeader, Num } from "@/components/ui/display";
import { Alert, Checkbox, Field, Select } from "@/components/ui/form";
import { Button, buttonClass } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { suggestMapping } from "@/domain/imports-fields";
import { commitImportAction, previewImportAction } from "@/app/actions/imports";
import type { ValidationResult } from "@/domain/imports";
import { errorMessage } from "@/i18n";

type Entity = "owners" | "buildings" | "units" | "tenants" | "contracts" | "cheques";

/** Import in four short steps: pick, upload, map, preview. Nothing is written until every row is valid. */
export function ImportWizard({ fields, order }: { fields: Record<string, { key: string; required: boolean }[]>; order: string[] }) {
  const { t } = useI18n();
  const [entity, setEntity] = useState<Entity>("owners");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDup, setSkipDup] = useState(false);
  const [preview, previewAction, previewing] = useActionState(previewImportAction, null);
  const [commit, commitAction, committing] = useActionState(commitImportAction, null);
  const result = (preview?.data?.result ?? null) as ValidationResult | null;

  function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        setHeaders(h);
        setRows(res.data);
        setMapping(suggestMapping(entity, h));
      },
    });
  }
  const missing = (fields[entity] ?? []).filter((f) => f.required && !mapping[f.key]);
  const payload = (
    <>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />
      <input type="hidden" name="fileName" value={fileName} />
    </>
  );
  const issueText = (code: string, params?: Record<string, string | number>) => errorMessage(t, code, params);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t("import.step1")} description={t("import.order_hint")} />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {order.map((e, i) => (
              <button key={e} type="button" onClick={() => { setEntity(e as Entity); setRows([]); setHeaders([]); setMapping({}); setFileName(""); }} className={`rounded-sm border px-3 py-2 text-[13.5px] font-medium ${entity === e ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line-strong bg-surface text-ink-2 hover:bg-surface-2"}`}>
                <Num className="text-ink-3">{i + 1}.</Num> {t(`import.entity.${e}` as never)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a className={buttonClass("secondary", "md")} href={`/api/templates/${entity}`}><Download className="size-4" aria-hidden />{t("import.template")}</a>
            <label className={buttonClass("primary", "md", "cursor-pointer")}>
              {t("import.upload")}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileName ? <span className="text-[13.5px] text-ink-2">{fileName} · <Num>{rows.length}</Num></span> : null}
          </div>
        </CardBody>
      </Card>

      {headers.length > 0 ? (
        <Card>
          <CardHeader title={t("import.step2")} description={t("import.map_hint")} />
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {(fields[entity] ?? []).map((f) => (
                <Field key={f.key} label={<><bdi className="ltr-num">{f.key}</bdi>{f.required ? <span className="text-bad-600"> *</span> : null}</>}>
                  <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    <option value="">{t("import.not_mapped")}</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>
            {missing.length > 0 ? <Alert tone="warn">{t("err.mapping_incomplete", { fields: missing.map((m) => m.key).join(", ") })}</Alert> : null}
            <form action={previewAction}>
              {payload}
              <Button type="submit" disabled={missing.length > 0 || previewing}>{previewing ? t("common.loading") : t("import.preview")}</Button>
            </form>
            {preview?.error ? <Alert tone="bad">{preview.error}</Alert> : null}
          </CardBody>
        </Card>
      ) : null}

      {result ? (
        <Card>
          <CardHeader title={t("import.step3")} />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-ok-50 p-3"><p className="text-[24px] font-semibold text-ok-700"><Num>{result.valid}</Num></p><p className="text-[12.5px] text-ok-700">{t("import.valid")}</p></div>
              <div className="rounded-md bg-warn-50 p-3"><p className="text-[24px] font-semibold text-warn-700"><Num>{result.duplicates.length}</Num></p><p className="text-[12.5px] text-warn-700">{t("import.duplicates")}</p></div>
              <div className="rounded-md bg-bad-50 p-3"><p className="text-[24px] font-semibold text-bad-700"><Num>{result.issues.length}</Num></p><p className="text-[12.5px] text-bad-700">{t("import.errors")}</p></div>
            </div>
            {result.issues.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-line p-3 text-[13px]">
                {result.issues.slice(0, 100).map((i, k) => (
                  <li key={k}><span className="font-semibold text-bad-700">{t("import.row")} <Num>{i.row}</Num></span>{i.field ? <> · <bdi className="ltr-num">{i.field}</bdi></> : null}: {issueText(i.code, i.params)}</li>
                ))}
              </ul>
            ) : null}
            {result.duplicates.length > 0 ? <Checkbox label={t("import.skip_duplicates", { n: result.duplicates.length })} checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} /> : null}
            <form action={commitAction}>
              {payload}
              {skipDup ? <input type="hidden" name="skipDuplicates" value="1" /> : null}
              <Button type="submit" size="lg" disabled={result.issues.length > 0 || committing || (result.duplicates.length > 0 && !skipDup) || result.valid + (skipDup ? 0 : 0) === 0}>
                {committing ? t("common.loading") : t("import.commit", { n: result.valid })}
              </Button>
            </form>
            {commit?.error ? <Alert tone="bad">{commit.error}</Alert> : null}
            <p className="text-[12.5px] text-ink-3">{t("import.atomic")}</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
