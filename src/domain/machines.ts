import { DomainError } from "./errors";
import type { Role } from "./permissions";

/**
 * The three state machines of the proposal (CR-11) held as data, not as scattered if statements.
 * Each transition lists who may trigger it and the condition that must hold first.
 */

export type Actor = Role | "system";

export interface Transition<S extends string> {
  from: S;
  to: S;
  roles: Actor[];
  /** i18n key describing the precondition shown when the transition is refused or offered. */
  rule?: string;
}

export interface Machine<S extends string> {
  name: "unit" | "maintenance" | "cheque";
  states: readonly S[];
  transitions: readonly Transition<S>[];
}

const M_ALL: Actor[] = ["manager", "system"];

/* ---------------------------- Unit (CR-11.1) ---------------------------- */

export type UnitStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "notice_given"
  | "vacated"
  | "under_inspection"
  | "inspected";

export const UNIT_STATES: readonly UnitStatus[] = [
  "available",
  "reserved",
  "occupied",
  "notice_given",
  "vacated",
  "under_inspection",
  "inspected",
];

export const unitMachine: Machine<UnitStatus> = {
  name: "unit",
  states: UNIT_STATES,
  transitions: [
    { from: "available", to: "reserved", roles: ["manager", "contracts", "system"], rule: "rule.unit.reserve" },
    { from: "reserved", to: "available", roles: ["manager", "contracts", "system"], rule: "rule.unit.cancel_reservation" },
    { from: "reserved", to: "occupied", roles: ["manager", "contracts", "system"], rule: "rule.unit.occupy" },
    { from: "occupied", to: "notice_given", roles: ["manager", "contracts", "system"], rule: "rule.unit.notice" },
    { from: "notice_given", to: "occupied", roles: ["manager", "contracts", "system"], rule: "rule.unit.withdraw_notice" },
    { from: "notice_given", to: "vacated", roles: ["manager", "contracts", "system"], rule: "rule.unit.vacate" },
    { from: "vacated", to: "under_inspection", roles: ["manager", "contracts", "system"], rule: "rule.unit.inspect" },
    { from: "under_inspection", to: "inspected", roles: ["maintenance"], rule: "rule.unit.inspected_by_maintenance" },
    { from: "inspected", to: "available", roles: ["manager"], rule: "rule.unit.approve" },
    { from: "inspected", to: "under_inspection", roles: ["manager"], rule: "rule.unit.reject_inspection" },
  ],
};

/* ------------------------- Maintenance (CR-11.2) ------------------------ */

export type MaintenanceStatus = "submitted" | "in_progress" | "waiting" | "completed";

export const MAINTENANCE_STATES: readonly MaintenanceStatus[] = ["submitted", "in_progress", "waiting", "completed"];

/**
 * Maintenance flow: a request is submitted, the team (or a manager) starts work, may put it on hold with a note
 * the tenant can read, and completes it. Cost is optional: entered when the office paid for the repair
 * (it then reaches the owner statement), left empty when the tenant is responsible.
 */
export const maintenanceMachine: Machine<MaintenanceStatus> = {
  name: "maintenance",
  states: MAINTENANCE_STATES,
  transitions: [
    { from: "submitted", to: "in_progress", roles: ["manager", "maintenance"], rule: "rule.maint.start" },
    { from: "in_progress", to: "waiting", roles: ["manager", "maintenance"], rule: "rule.maint.wait" },
    { from: "waiting", to: "in_progress", roles: ["manager", "maintenance"], rule: "rule.maint.resume" },
    { from: "in_progress", to: "completed", roles: ["manager", "maintenance"], rule: "rule.maint.complete" },
  ],
};

/* --------------------------- Cheque (CR-11.3) --------------------------- */

export type ChequeStatus =
  | "received"
  | "due"
  | "deposited"
  | "collected"
  | "bounced"
  | "follow_up"
  | "written_off"
  | "returned";

export const CHEQUE_STATES: readonly ChequeStatus[] = [
  "received",
  "due",
  "deposited",
  "collected",
  "bounced",
  "follow_up",
  "written_off",
  "returned",
];

export const chequeMachine: Machine<ChequeStatus> = {
  name: "cheque",
  states: CHEQUE_STATES,
  transitions: [
    { from: "received", to: "due", roles: ["system"], rule: "rule.cheque.due" },
    { from: "due", to: "deposited", roles: ["manager", "accounts"], rule: "rule.cheque.deposit" },
    { from: "deposited", to: "collected", roles: ["manager", "accounts"], rule: "rule.cheque.collect" },
    { from: "deposited", to: "bounced", roles: ["manager", "accounts"], rule: "rule.cheque.bounce" },
    { from: "bounced", to: "follow_up", roles: ["manager", "accounts"], rule: "rule.cheque.follow_up" },
    { from: "follow_up", to: "collected", roles: ["manager", "accounts"], rule: "rule.cheque.recover" },
    { from: "follow_up", to: "written_off", roles: ["manager"], rule: "rule.cheque.write_off" },
    // Post-dated cheques handed back to the tenant when a contract ends early.
    { from: "received", to: "returned", roles: ["manager", "contracts", "system"], rule: "rule.cheque.return" },
    { from: "due", to: "returned", roles: ["manager", "contracts", "system"], rule: "rule.cheque.return" },
    // Only reachable by voiding the receipt of a collected cheque (correction path).
    { from: "collected", to: "deposited", roles: ["manager", "system"], rule: "rule.cheque.reopen" },
  ],
};

/* ------------------------------- Engine -------------------------------- */

export function findTransition<S extends string>(machine: Machine<S>, from: S, to: S): Transition<S> | undefined {
  return machine.transitions.find((t) => t.from === from && t.to === to);
}

/** Throws a DomainError explaining why when the transition is not allowed. */
export function assertTransition<S extends string>(machine: Machine<S>, from: S, to: S, actor: Actor): Transition<S> {
  const t = findTransition(machine, from, to);
  if (!t) {
    throw new DomainError("invalid_transition", { machine: machine.name, from, to });
  }
  if (!t.roles.includes(actor)) {
    throw new DomainError("transition_role", { machine: machine.name, from, to });
  }
  return t;
}

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S, actor: Actor): boolean {
  const t = findTransition(machine, from, to);
  return !!t && t.roles.includes(actor);
}

/** Transitions the actor can trigger from the current state (for UI action menus). */
export function availableTransitions<S extends string>(machine: Machine<S>, from: S, actor: Actor): Transition<S>[] {
  return machine.transitions.filter((t) => t.from === from && t.roles.includes(actor));
}

export { M_ALL };
