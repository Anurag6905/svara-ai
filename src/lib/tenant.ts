import type { Role } from "@/db/enums";

/**
 * The authenticated actor for a request. Every service function takes one of
 * these and scopes all reads and writes to `organisationId`. Services never
 * accept an organisation id from the client.
 */
export interface TenantContext {
  userId: string;
  organisationId: string;
  role: Role;
}

export class NotFoundError extends Error {
  constructor(entity: string) {
    super(`${entity} not found`);
    this.name = "NotFoundError";
  }
}
