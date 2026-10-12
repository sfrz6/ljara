import type { Role } from "./permissions";

export type ActorKind = "user" | "tenant" | "system";

/** Everything a domain service needs to know about who is acting and inside which organisation. */
export interface Ctx {
  orgId: string;
  actor: {
    kind: ActorKind;
    id: string | null;
    name: string;
    role: Role | "tenant" | "system";
  };
}

export function systemCtx(orgId: string, name = "System"): Ctx {
  return { orgId, actor: { kind: "system", id: null, name, role: "system" } };
}

export function staffRole(ctx: Ctx): Role | null {
  return ctx.actor.kind === "user" ? (ctx.actor.role as Role) : null;
}

/** The actor type used by the state machines (a system action is allowed where "system" is listed). */
export function machineActor(ctx: Ctx): Role | "system" {
  return ctx.actor.kind === "user" ? (ctx.actor.role as Role) : "system";
}
