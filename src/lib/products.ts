import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { products, type Product } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { assertCan } from "@/lib/auth/rbac";
import { NotFoundError, type TenantContext } from "@/lib/tenant";
import { ValidationError } from "@/lib/users";

export * from "./product-meta";
import { productAttributesSchema, type ProductAttributes } from "./product-meta";

export const productInputSchema = z.object({
  name: z.string().trim().min(3, "Name is required").max(80),
  category: z.string().trim().min(2, "Category is required").max(60),
  approvedDescription: z.string().trim().min(10, "Add the lender-approved description").max(800),
  eligibilityWording: z.string().trim().max(600).optional().or(z.literal("")),
  disclaimers: z.string().trim().max(800).optional().or(z.literal("")),
  prohibitedStatements: z.string().trim().max(800).optional().or(z.literal("")),
  attributes: productAttributesSchema,
});
export type ProductInput = z.infer<typeof productInputSchema>;

export function parseAttributes(product: Pick<Product, "attributesJson">): ProductAttributes | null {
  try {
    const result = productAttributesSchema.safeParse(JSON.parse(product.attributesJson));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function listProducts(db: Db, ctx: TenantContext, opts: { activeOnly?: boolean } = {}) {
  assertCan(ctx.role, "products.view");
  const where = opts.activeOnly
    ? and(eq(products.organisationId, ctx.organisationId), eq(products.status, "ACTIVE"))
    : eq(products.organisationId, ctx.organisationId);
  const rows = await db.select().from(products).where(where).orderBy(asc(products.category), asc(products.name));
  return rows.map((p) => ({ ...p, attributes: parseAttributes(p) }));
}

export async function getProduct(db: Db, ctx: TenantContext, id: string) {
  assertCan(ctx.role, "products.view");
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.organisationId, ctx.organisationId)));
  if (!row) throw new NotFoundError("Product");
  return { ...row, attributes: parseAttributes(row) };
}

function toRow(input: ProductInput) {
  return {
    name: input.name,
    category: input.category,
    approvedDescription: input.approvedDescription,
    eligibilityWording: input.eligibilityWording || null,
    disclaimers: input.disclaimers || null,
    prohibitedStatements: input.prohibitedStatements || null,
    attributesJson: JSON.stringify(input.attributes),
    updatedAt: new Date(),
  };
}

export async function createProduct(db: Db, ctx: TenantContext, input: ProductInput) {
  assertCan(ctx.role, "products.manage");
  const data = productInputSchema.parse(input);
  const [row] = await db
    .insert(products)
    .values({ ...toRow(data), organisationId: ctx.organisationId, status: "ACTIVE" })
    .returning();
  await recordAudit(db, ctx, { action: "product.create", entityType: "product", entityId: row.id, metadata: { name: data.name } });
  return row;
}

export async function updateProduct(db: Db, ctx: TenantContext, id: string, input: ProductInput) {
  assertCan(ctx.role, "products.manage");
  await getProduct(db, ctx, id);
  const data = productInputSchema.parse(input);
  const [row] = await db
    .update(products)
    .set(toRow(data))
    .where(and(eq(products.id, id), eq(products.organisationId, ctx.organisationId)))
    .returning();
  await recordAudit(db, ctx, { action: "product.update", entityType: "product", entityId: id, metadata: { name: data.name } });
  return row;
}

export async function setProductStatus(db: Db, ctx: TenantContext, id: string, status: "ACTIVE" | "INACTIVE") {
  assertCan(ctx.role, "products.manage");
  const current = await getProduct(db, ctx, id);
  if (status === "ACTIVE" && !current.attributes) {
    throw new ValidationError("This product's attributes are incomplete. Edit and save it before activating.");
  }
  await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.organisationId, ctx.organisationId)));
  await recordAudit(db, ctx, {
    action: status === "ACTIVE" ? "product.activate" : "product.deactivate",
    entityType: "product",
    entityId: id,
  });
}

