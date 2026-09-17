import { describe, expect, it } from "vitest";

import {
  buildEditedTransferInput,
  buildMoneyMoverView,
  validateAmountDraft,
} from "@/components/cards/money-mover";
import type { RowDisplay } from "@/components/cards/write-card";

const MAX_UINT256 = (2n ** 256n - 1n).toString();
const EXACTLY_2_255 = (2n ** 255n).toString();

function rowByKey(view: ReturnType<typeof buildMoneyMoverView>, key: string) {
  return view?.rows.find((r) => r.key === key);
}
function amount(display: RowDisplay | undefined): { human: string; unit?: string } | undefined {
  return display?.kind === "amount" ? { human: display.human, unit: display.unit } : undefined;
}

describe("buildMoneyMoverView — native transfer (execute_transfer, no token)", () => {
  const view = buildMoneyMoverView("execute_transfer", {
    chain_id: "11155111",
    to_address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    amount: "0.1",
  });

  it("classifies native-transfer with a Send title and effect-class meta", () => {
    expect(view?.family).toBe("native-transfer");
    expect(view?.title).toBe("Send");
    expect(view?.meta).toBe("Sepolia · value-moving write");
  });

  it("renders the amount decimals-aware in ETH, mono via the money module", () => {
    expect(amount(rowByKey(view, "amount")?.display)).toEqual({ human: "0.1", unit: "ETH" });
  });

  it("groups a large native amount via the money module (no float)", () => {
    const big = buildMoneyMoverView("execute_transfer", {
      chain_id: "1",
      to_address: "0xabc",
      amount: "1000",
    });
    expect(amount(rowByKey(big, "amount")?.display)?.human).toBe("1,000");
  });

  it("shows the recipient as a truncatable address and the network by name", () => {
    expect(rowByKey(view, "to_address")?.display?.kind).toBe("address");
    expect(rowByKey(view, "network")?.value).toBe("Sepolia");
    expect(view?.summary).toContain("Sent 0.1 ETH to 0xd8dA…6045.");
  });
});

describe("buildMoneyMoverView — ERC-20 transfer (execute_transfer, token_address)", () => {
  const view = buildMoneyMoverView("execute_transfer", {
    chain_id: "1",
    to_address: "0xrecipient",
    amount: "25",
    token_address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  });

  it("classifies token-transfer and adds a Token row", () => {
    expect(view?.family).toBe("token-transfer");
    expect(rowByKey(view, "token")?.display?.kind).toBe("address");
  });

  it("shows the exact human amount with NO guessed unit when the token is unknown (honest)", () => {
    // No token-metadata source resolves this address → no symbol, no fabricated unit.
    expect(amount(rowByKey(view, "amount")?.display)).toEqual({ human: "25", unit: undefined });
  });
});

describe("buildMoneyMoverView — Solana transfer (AC 2)", () => {
  const view = buildMoneyMoverView("execute_transfer", {
    chain_id: "101",
    to_address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
    amount: "1.5",
  });

  it("classifies solana-transfer with the SOL unit and a Solana network", () => {
    expect(view?.family).toBe("solana-transfer");
    expect(view?.meta).toBe("Solana · value-moving write");
    expect(amount(rowByKey(view, "amount")?.display)).toEqual({ human: "1.5", unit: "SOL" });
    expect(rowByKey(view, "network")?.value).toBe("Solana");
  });
});

describe("buildMoneyMoverView — approve (authorization grant, highest-risk)", () => {
  it("flags an UNLIMITED allowance plainly (the danger simulation cannot see)", () => {
    const view = buildMoneyMoverView("execute_contract_call", {
      chain_id: "1",
      contract_address: "0xtoken",
      function_name: "approve",
      function_args: `["0xspender","${MAX_UINT256}"]`,
      stateMutability: "nonpayable",
    });
    expect(view?.family).toBe("approve");
    expect(view?.title).toBe("Approve");
    expect(view?.meta).toBe("Ethereum · authorization grant");
    expect(view?.warning).toContain("unlimited allowance");
    expect(rowByKey(view, "allowance")?.value).toBe("Unlimited");
    expect(rowByKey(view, "spender")?.display?.kind).toBe("address");
  });

  it("flags a VERY LARGE (>= 2^255) allowance too", () => {
    const view = buildMoneyMoverView("execute_contract_call", {
      chain_id: "1",
      contract_address: "0xtoken",
      function_name: "approve",
      function_args: `["0xspender","${EXACTLY_2_255}"]`,
      stateMutability: "nonpayable",
    });
    expect(view?.warning).toContain("unlimited allowance");
    expect(rowByKey(view, "allowance")?.value).toBe("Very large");
  });

  it("shows a bounded allowance as its EXACT base units (no guessed decimals), no warning", () => {
    const view = buildMoneyMoverView("execute_contract_call", {
      chain_id: "1",
      contract_address: "0xtoken",
      function_name: "approve",
      function_args: `["0xspender","1000000"]`,
      stateMutability: "nonpayable",
    });
    expect(view?.warning).toBeUndefined();
    expect(amount(rowByKey(view, "allowance")?.display)?.human).toBe("1000000");
  });
});

describe("in-card amount editing (Task 4)", () => {
  it("exposes an editable amount ONLY for a transfer (its wire amount is human), not for approve", () => {
    const transfer = buildMoneyMoverView("execute_transfer", {
      chain_id: "1",
      to_address: "0xr",
      amount: "0.1",
    });
    expect(transfer?.amountEdit).toEqual({ value: "0.1", decimals: 18 });

    const approve = buildMoneyMoverView("execute_contract_call", {
      chain_id: "1",
      contract_address: "0xt",
      function_name: "approve",
      function_args: `["0xspender","1000"]`,
      stateMutability: "nonpayable",
    });
    // Approve's allowance is base units with no decimals source → not editable in-card.
    expect(approve?.amountEdit).toBeUndefined();
  });

  it("validateAmountDraft rejects empty, non-numeric, and > decimals fractional input", () => {
    expect(validateAmountDraft("45", 18)).toBeUndefined();
    expect(validateAmountDraft("0.5", 18)).toBeUndefined();
    expect(validateAmountDraft("", 18)).toContain("Enter an amount");
    expect(validateAmountDraft("abc", 18)).toBeDefined();
    // 7 fractional digits on a 6-decimal token is rejected (never silently truncated).
    expect(validateAmountDraft("0.1234567", 6)).toContain("6 decimal");
    // Unknown decimals default to 18 (lenient) but still reject non-decimals.
    expect(validateAmountDraft("1.5", undefined)).toBeUndefined();
    expect(validateAmountDraft("1e9", undefined)).toBeDefined();
    // A decimal comma is refused with how to write it, never read as a bigger number (decision 40).
    expect(validateAmountDraft("0,5", 18)).toBe("Use a dot for decimals (0.5) and no thousands separators.");
    expect(validateAmountDraft("1.234,5", undefined)).toContain("dot for decimals");
  });

  it("buildEditedTransferInput replaces ONLY the amount, never the op identity", () => {
    const input = { chain_id: "11155111", to_address: "0xr", amount: "0.1" };
    expect(buildEditedTransferInput("execute_transfer", input, "45")).toEqual({
      chain_id: "11155111",
      to_address: "0xr",
      amount: "45",
    });
    // A non-transfer tool is never edited here (defence in depth; the server also rejects it).
    const approve = { function_name: "approve", chain_id: "1" };
    expect(buildEditedTransferInput("execute_contract_call", approve, "45")).toEqual(approve);
  });
});

describe("buildMoneyMoverView — degrades to undefined (→ the generic write card)", () => {
  it("returns undefined for a non-money-mover write (protocol action, generic contract write)", () => {
    expect(
      buildMoneyMoverView("execute_protocol_action", { actionType: "uniswap/swap", params: {} }),
    ).toBeUndefined();
    expect(
      buildMoneyMoverView("execute_contract_call", {
        chain_id: "1",
        contract_address: "0xc",
        function_name: "deposit",
        stateMutability: "payable",
      }),
    ).toBeUndefined();
  });

  it("returns undefined on malformed input — a bespoke fault degrades to the generic card (AD-12)", () => {
    expect(buildMoneyMoverView("execute_transfer", null)).toBeUndefined();
    expect(buildMoneyMoverView("execute_transfer", { chain_id: "1", to_address: "0x" })).toBeUndefined();
    expect(buildMoneyMoverView("execute_transfer", {})).toBeUndefined();
  });
});
