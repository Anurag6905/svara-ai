import { Package, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { setProductStatusAction } from "@/app/actions/domain";
import { ActionButton } from "@/components/action-button";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { formatINR, listProducts, PURPOSES } from "@/lib/products";

export const metadata: Metadata = { title: "Product catalogue" };

const d = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export default async function ProductsPage() {
  const { ctx } = await requirePermission("products.view");
  const items = await listProducts(getDb(), ctx);
  const manage = can(ctx.role, "products.manage");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Product catalogue"
        description="Lender-approved reference information used for matching. This is not an underwriting engine — it never decides eligibility."
        actions={manage && <ButtonLink href="/products/new" variant="primary"><Plus className="size-4" /> New product</ButtonLink>}
      />
      {!manage && (
        <div className="mb-6">
          <Notice tone="neutral">Only an Organisation Admin can edit the catalogue.</Notice>
        </div>
      )}
      {items.length === 0 ? (
        <Card>
          <EmptyState icon={Package} title="No products yet" description="Add the lender's approved products so conversations can be matched to them." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id} className={p.status === "INACTIVE" ? "opacity-70" : ""}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-3">{p.category}</p>
                    <Link href={`/products/${p.id}`} className="mt-0.5 block text-base font-semibold hover:underline">
                      {p.name}
                    </Link>
                  </div>
                  <Badge tone={p.status === "ACTIVE" ? "ok" : "neutral"} dot>
                    {p.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{p.approvedDescription}</p>
                {p.attributes ? (
                  <>
                    <p className="tabular mt-4 text-sm font-medium">
                      {formatINR(p.attributes.minAmount)} – {formatINR(p.attributes.maxAmount)}
                      {p.attributes.minTenureMonths && p.attributes.maxTenureMonths && (
                        <span className="font-normal text-ink-3"> · {p.attributes.minTenureMonths}–{p.attributes.maxTenureMonths} months</span>
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.attributes.purposes.map((k) => (
                        <Badge key={k}>{PURPOSES[k]}</Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-xs text-warn">Attributes incomplete — not used for matching.</p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-xs text-ink-3">
                <span>Updated {d.format(p.updatedAt)}</span>
                <span className="flex gap-2">
                  <ButtonLink href={`/products/${p.id}`} size="sm" variant="ghost">{manage ? "Edit" : "View"}</ButtonLink>
                  {manage && (
                    <ActionButton size="sm" action={setProductStatusAction.bind(null, p.id, p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>
                      {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </ActionButton>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
