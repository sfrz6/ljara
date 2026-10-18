import { describe, expect, it } from "vitest";
import {
  CHEQUE_STATES,
  MAINTENANCE_STATES,
  UNIT_STATES,
  assertTransition,
  availableTransitions,
  canTransition,
  chequeMachine,
  maintenanceMachine,
  unitMachine,
} from "@/domain/machines";
import { DomainError } from "@/domain/errors";

describe("unit state machine (CR-11.1)", () => {
  it("follows the lifecycle exactly", () => {
    const path: [string, string, "manager" | "contracts" | "maintenance"][] = [
      ["available", "reserved", "contracts"],
      ["reserved", "occupied", "contracts"],
      ["occupied", "notice_given", "contracts"],
      ["notice_given", "vacated", "manager"],
      ["vacated", "under_inspection", "manager"],
      ["under_inspection", "inspected", "maintenance"],
      ["inspected", "available", "manager"],
    ];
    for (const [from, to, who] of path) expect(canTransition(unitMachine, from as never, to as never, who)).toBe(true);
  });

  it("a vacated unit cannot jump back to available without inspection and approval", () => {
    for (const from of ["vacated", "under_inspection", "notice_given", "occupied"] as const) {
      expect(canTransition(unitMachine, from, "available", "manager")).toBe(false);
      expect(() => assertTransition(unitMachine, from, "available", "manager")).toThrow(DomainError);
    }
  });

  it("only maintenance records the inspection and only the manager approves it", () => {
    expect(canTransition(unitMachine, "under_inspection", "inspected", "manager")).toBe(false);
    expect(canTransition(unitMachine, "under_inspection", "inspected", "maintenance")).toBe(true);
    expect(canTransition(unitMachine, "inspected", "available", "maintenance")).toBe(false);
    expect(canTransition(unitMachine, "inspected", "available", "contracts")).toBe(false);
    expect(canTransition(unitMachine, "inspected", "available", "manager")).toBe(true);
  });

  it("rejects every transition that is not listed", () => {
    const allowed = new Set(unitMachine.transitions.map((t) => `${t.from}>${t.to}`));
    for (const from of UNIT_STATES) {
      for (const to of UNIT_STATES) {
        if (!allowed.has(`${from}>${to}`)) expect(canTransition(unitMachine, from, to, "manager")).toBe(false);
      }
    }
  });

  it("offers the manager only the next legal steps", () => {
    expect(availableTransitions(unitMachine, "inspected", "manager").map((t) => t.to).sort()).toEqual(["available", "under_inspection"]);
  });
});

describe("maintenance state machine", () => {
  it("runs submitted, in progress, waiting and completed", () => {
    expect(canTransition(maintenanceMachine, "submitted", "in_progress", "maintenance")).toBe(true);
    expect(canTransition(maintenanceMachine, "submitted", "in_progress", "manager")).toBe(true);
    expect(canTransition(maintenanceMachine, "in_progress", "waiting", "maintenance")).toBe(true);
    expect(canTransition(maintenanceMachine, "waiting", "in_progress", "maintenance")).toBe(true);
    expect(canTransition(maintenanceMachine, "in_progress", "completed", "maintenance")).toBe(true);
  });

  it("refuses everything else", () => {
    const allowed = new Set(maintenanceMachine.transitions.map((t) => `${t.from}>${t.to}`));
    for (const from of MAINTENANCE_STATES) {
      for (const to of MAINTENANCE_STATES) {
        if (!allowed.has(`${from}>${to}`)) expect(canTransition(maintenanceMachine, from, to, "manager")).toBe(false);
      }
    }
    expect(canTransition(maintenanceMachine, "submitted", "completed", "manager")).toBe(false);
    expect(canTransition(maintenanceMachine, "completed", "in_progress", "manager")).toBe(false);
  });

  it("accounts and contracts staff cannot move a request", () => {
    expect(canTransition(maintenanceMachine, "submitted", "in_progress", "accounts")).toBe(false);
    expect(canTransition(maintenanceMachine, "in_progress", "completed", "contracts")).toBe(false);
  });
});

describe("cheque state machine (CR-11.3)", () => {
  it("collected path and bounced path", () => {
    expect(canTransition(chequeMachine, "received", "due", "system")).toBe(true);
    expect(canTransition(chequeMachine, "due", "deposited", "accounts")).toBe(true);
    expect(canTransition(chequeMachine, "deposited", "collected", "accounts")).toBe(true);
    expect(canTransition(chequeMachine, "deposited", "bounced", "accounts")).toBe(true);
    expect(canTransition(chequeMachine, "bounced", "follow_up", "accounts")).toBe(true);
    expect(canTransition(chequeMachine, "follow_up", "collected", "accounts")).toBe(true);
    expect(canTransition(chequeMachine, "follow_up", "written_off", "manager")).toBe(true);
  });

  it("a cheque cannot be collected before it is due and deposited", () => {
    expect(canTransition(chequeMachine, "received", "collected", "manager")).toBe(false);
    expect(canTransition(chequeMachine, "due", "collected", "manager")).toBe(false);
    expect(canTransition(chequeMachine, "received", "deposited", "manager")).toBe(false);
  });

  it("a bounced cheque goes through follow up and cannot be written off by accounts", () => {
    expect(canTransition(chequeMachine, "bounced", "written_off", "manager")).toBe(false);
    expect(canTransition(chequeMachine, "bounced", "collected", "manager")).toBe(false);
    expect(canTransition(chequeMachine, "follow_up", "written_off", "accounts")).toBe(false);
  });

  it("terminal states have no way out", () => {
    for (const to of CHEQUE_STATES) {
      expect(canTransition(chequeMachine, "written_off", to, "manager")).toBe(false);
      expect(canTransition(chequeMachine, "returned", to, "manager")).toBe(false);
    }
  });
});
