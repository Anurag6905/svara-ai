"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProductAction } from "@/app/actions/domain";
import { Button, Card, CardHeader, Field, inputClass, Notice } from "@/components/ui";
import { PURPOSES, PURPOSE_KEYS, type ProductAttributes, type PurposeKey } from "@/lib/product-meta";

export interface ProductFormValues {
  name: string;
  category: string;
  approvedDescription: string;
  eligibilityWording: string;
  disclaimers: string;
  prohibitedStatements: string;
  attributes: ProductAttributes;
}

const EMPTY: ProductFormValues = {
  name: "",
  category: "Business Loan",
  approvedDescription: "",
  eligibilityWording: "",
  disclaimers: "",
  prohibitedStatements: "",
  attributes: { purposes: [], minAmount: 100000, maxAmount: 1000000, minTenureMonths: 12, maxTenureMonths: 60, customerSegment: "SME" },
};

export function ProductForm({ productId, initial, readOnly }: { productId: string | null; initial?: ProductFormValues; readOnly?: boolean }) {
  const [v, setV] = useState<ProductFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = <K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const setA = <K extends keyof ProductAttributes>(k: K, val: ProductAttributes[K]) => setV((p) => ({ ...p, attributes: { ...p.attributes, [k]: val } }));
  const togglePurpose = (k: PurposeKey) =>
    setA("purposes", v.attributes.purposes.includes(k) ? v.attributes.purposes.filter((x) => x !== k) : [...v.attributes.purposes, k]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveProductAction(productId, {
        ...v,
        attributes: {
          ...v.attributes,
          approvedRateText: v.attributes.approvedRateText || undefined,
          approvedFeeText: v.attributes.approvedFeeText || undefined,
        },
      });
      if (r.ok) {
        setErrors({});
        setMsg({ ok: true, text: r.message });
        if (!productId && r.data) router.push(`/products/${r.data.id}`);
        else router.refresh();
      } else {
        setErrors("fieldErrors" in r && r.fieldErrors ? r.fieldErrors : {});
        setMsg({ ok: false, text: r.message });
      }
    });
  }

  const num = (k: "minAmount" | "maxAmount" | "minTenureMonths" | "maxTenureMonths") => (
    <input
      id={k}
      type="number"
      min={0}
      disabled={readOnly}
      className={inputClass}
      value={v.attributes[k] ?? ""}
      onChange={(e) => setA(k, e.target.value === "" ? undefined! : Number(e.target.value))}
    />
  );

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Approved product information" description="Wording here is what the lender has approved. SVARA quotes nothing that isn't on this page." />
          <fieldset disabled={readOnly} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Product name" htmlFor="name" error={errors.name}>
              <input id="name" className={inputClass} value={v.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="category" error={errors.category}>
              <input id="category" className={inputClass} value={v.category} onChange={(e) => set("category", e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Approved description" htmlFor="desc" error={errors.approvedDescription}>
                <textarea id="desc" rows={3} className={`${inputClass} h-auto py-2`} value={v.approvedDescription} onChange={(e) => set("approvedDescription", e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Eligibility wording (supplied by lender)" htmlFor="elig" hint="Shown to reviewers. Never used to decide eligibility.">
                <textarea id="elig" rows={2} className={`${inputClass} h-auto py-2`} value={v.eligibilityWording} onChange={(e) => set("eligibilityWording", e.target.value)} />
              </Field>
            </div>
            <Field label="Required disclaimers" htmlFor="disc">
              <textarea id="disc" rows={3} className={`${inputClass} h-auto py-2`} value={v.disclaimers} onChange={(e) => set("disclaimers", e.target.value)} />
            </Field>
            <Field label="Prohibited statements" htmlFor="prohib">
              <textarea id="prohib" rows={3} className={`${inputClass} h-auto py-2`} value={v.prohibitedStatements} onChange={(e) => set("prohibitedStatements", e.target.value)} />
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Approved purposes" description="Matching only suggests this product when the customer states one of these purposes." />
          <fieldset disabled={readOnly} className="grid gap-2 p-5 sm:grid-cols-2">
            {PURPOSE_KEYS.map((k) => {
              const on = v.attributes.purposes.includes(k);
              return (
                <label key={k} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-colors ${on ? "border-ink bg-ink text-white" : "border-line-strong hover:border-ink-4"}`}>
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => togglePurpose(k)} />
                  <span className={`grid size-4 place-items-center rounded border ${on ? "border-white bg-white text-ink" : "border-ink-4"}`}>{on && "✓"}</span>
                  {PURPOSES[k]}
                </label>
              );
            })}
            {errors["attributes.purposes"] && <p className="text-xs text-danger sm:col-span-2">{errors["attributes.purposes"]}</p>}
          </fieldset>
        </Card>
      </div>

      <div className="space-y-6 lg:sticky lg:top-6">
        <Card>
          <CardHeader title="Approved ranges" />
          <fieldset disabled={readOnly} className="space-y-4 p-5">
            <Field label="Customer segment" htmlFor="segment">
              <select id="segment" className={inputClass} value={v.attributes.customerSegment} onChange={(e) => setA("customerSegment", e.target.value as "SME" | "INDIVIDUAL")}>
                <option value="SME">Small business (SME)</option>
                <option value="INDIVIDUAL">Individual</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min amount (₹)" htmlFor="minAmount" error={errors["attributes.minAmount"]}>{num("minAmount")}</Field>
              <Field label="Max amount (₹)" htmlFor="maxAmount" error={errors["attributes.maxAmount"]}>{num("maxAmount")}</Field>
              <Field label="Min tenure (months)" htmlFor="minTenureMonths">{num("minTenureMonths")}</Field>
              <Field label="Max tenure (months)" htmlFor="maxTenureMonths" error={errors["attributes.maxTenureMonths"]}>{num("maxTenureMonths")}</Field>
            </div>
            <Field label="Approved rate text" htmlFor="rate" hint="Leave blank unless the lender supplied approved wording.">
              <input id="rate" className={inputClass} value={v.attributes.approvedRateText ?? ""} onChange={(e) => setA("approvedRateText", e.target.value)} />
            </Field>
          </fieldset>
        </Card>
        {msg && <Notice tone={msg.ok ? "ok" : "danger"}>{msg.text}</Notice>}
        {!readOnly && (
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {productId ? "Save changes" : "Create product"}
          </Button>
        )}
      </div>
    </form>
  );
}
