import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The accessor seam is mocked (repo convention: no test DB); the writer's
// never-throw behaviour is what is under test.
const { setIntentExecutionId } = vi.hoisted(() => ({ setIntentExecutionId: vi.fn() }));
vi.mock("@/lib/data/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/ledger")>()),
  setIntentExecutionId,
}));

import { recordExecutionId } from "@/lib/ledger";

const INPUT = { session: { orgId: "org-1" }, id: "led-1", executionId: "exec-1", requestId: "req-1" };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  setIntentExecutionId.mockReset();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("recordExecutionId", () => {
  it("stamps the execution id on the org's intent row", async () => {
    setIntentExecutionId.mockResolvedValue(true);

    await recordExecutionId(INPUT);

    expect(setIntentExecutionId).toHaveBeenCalledWith({ orgId: "org-1" }, "led-1", "exec-1");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs, and carries on, when no intent row took the stamp", async () => {
    setIntentExecutionId.mockResolvedValue(false);

    await recordExecutionId(INPUT);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ledger_execution_id_not_stamped"));
  });

  it("never throws out to the write that is already moving value", async () => {
    setIntentExecutionId.mockRejectedValue(new Error("db down"));

    await expect(recordExecutionId(INPUT)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ledger_execution_id_write_failed"));
  });
});
