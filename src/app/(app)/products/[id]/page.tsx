import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/rbac";
import { requirePermission } from "@/lib/auth/session";
import { getProduct } from "@/lib/products";
import { NotFoundError } from "@/lib/tenant";
import { ProductForm } from "../product-form";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requirePermission("products.view");
  const { id } = await params;
  const isNew = id === "new";
  if (isNew && !can(ctx.role, "products.manage")) notFound();
  let product = null;
  if (!isNew) {
    try {
      product = await getProduct(getDb(), ctx, id);
    } catch (e) {
      if (e instanceof NotFoundError) notFound();
      throw e;
    }
  }
  return (
    <>
      <Link href="/products" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Catalogue
      </Link>
      <PageHeader eyebrow={isNew ? "New product" : product!.category} title={isNew ? "Add an approved product" : product!.name} />
      <ProductForm
        productId={isNew ? null : product!.id}
        readOnly={!can(ctx.role, "products.manage")}
        initial={
          product && product.attributes
            ? {
                name: product.name,
                category: product.category,
                approvedDescription: product.approvedDescription,
                eligibilityWording: product.eligibilityWording ?? "",
                disclaimers: product.disclaimers ?? "",
                prohibitedStatements: product.prohibitedStatements ?? "",
                attributes: product.attributes,
              }
            : undefined
        }
      />
    </>
  );
}
