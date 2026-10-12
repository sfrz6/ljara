import { ForbiddenError } from "./errors";

export type Role = "platform_admin" | "manager" | "accounts" | "maintenance" | "contracts";
export const STAFF_ROLES: Role[] = ["manager", "accounts", "maintenance", "contracts"];

export type Permission =
  | "dashboard:view"
  | "owners:view"
  | "owners:manage"
  | "buildings:view"
  | "buildings:manage"
  | "units:view"
  | "units:manage"
  | "units:transition"
  | "tenants:view"
  | "tenants:manage"
  | "contracts:view"
  | "contracts:manage"
  | "cheques:view"
  | "cheques:record"
  | "cheques:process"
  | "cheques:writeoff"
  | "payments:view"
  | "payments:record"
  | "receipts:view"
  | "receipts:void"
  | "maintenance:view"
  | "maintenance:create"
  | "maintenance:manage"
  | "maintenance:work"
  | "maintenance:costs"
  | "inspections:perform"
  | "inspections:approve"
  | "statements:view"
  | "statements:generate"
  | "imports:manage"
  | "notifications:view"
  | "audit:view"
  | "settings:view"
  | "settings:manage"
  | "users:manage"
  | "platform:manage";

const MANAGER: Permission[] = [
  "dashboard:view",
  "owners:view",
  "owners:manage",
  "buildings:view",
  "buildings:manage",
  "units:view",
  "units:manage",
  "units:transition",
  "tenants:view",
  "tenants:manage",
  "contracts:view",
  "contracts:manage",
  "cheques:view",
  "cheques:record",
  "cheques:process",
  "cheques:writeoff",
  "payments:view",
  "payments:record",
  "receipts:view",
  "receipts:void",
  "maintenance:view",
  "maintenance:create",
  "maintenance:manage",
  "maintenance:costs",
  "inspections:approve",
  "statements:view",
  "statements:generate",
  "imports:manage",
  "notifications:view",
  "audit:view",
  "settings:view",
  "settings:manage",
  "users:manage",
];

/**
 * Permission matrix (proposal CR-2.x). Platform administrators hold no operational permission:
 * they cannot read tenant personal data or financial records of any organisation.
 */
export const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  platform_admin: new Set<Permission>(["platform:manage"]),
  manager: new Set<Permission>(MANAGER),
  accounts: new Set<Permission>([
    "dashboard:view",
    "owners:view",
    "buildings:view",
    "units:view",
    "tenants:view",
    "contracts:view",
    "cheques:view",
    "cheques:process",
    "payments:view",
    "payments:record",
    "receipts:view",
    "notifications:view",
  ]),
  maintenance: new Set<Permission>([
    "dashboard:view",
    "buildings:view",
    "units:view",
    "maintenance:view",
    "maintenance:create",
    "maintenance:work",
    "inspections:perform",
    "notifications:view",
  ]),
  contracts: new Set<Permission>([
    "dashboard:view",
    "owners:view",
    "buildings:view",
    "units:view",
    "units:transition",
    "tenants:view",
    "tenants:manage",
    "contracts:view",
    "contracts:manage",
    "cheques:view",
    "cheques:record",
    "notifications:view",
  ]),
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  return !!role && PERMISSIONS[role].has(permission);
}

export function assertCan(role: Role | undefined | null, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}

export const ROLE_LABEL_KEY: Record<Role | "tenant", string> = {
  platform_admin: "role.platform_admin",
  manager: "role.manager",
  accounts: "role.accounts",
  maintenance: "role.maintenance",
  contracts: "role.contracts",
  tenant: "role.tenant",
};
