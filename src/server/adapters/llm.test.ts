import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ClaudeLLM } from "./llm";
import { config } from "../config";

const args = {
  system: "Extract only sourced facts.",
  user: "Supplier page text",
  schema: z.object({ ok: z.boolean() }),
};
const message = (text: string, stopReason = "end_turn") =>
  Response.json({
    content: [{ type: "text", text }],
    stop_reason: stopReason,
  });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Claude Messages adapter", () => {
  it("uses native Anthropic headers and payload with a separate system prompt", async () => {
    vi.stubEnv("ANTHROPIC_MODEL", "custom-claude-model");
    vi.stubEnv("LLM_API_KEY", "old-provider-secret");
    vi.stubEnv("LLM_BASE_URL", "https://old-provider.example/v1");
    const fetch = vi.fn().mockResolvedValue(message('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);

    expect(await new ClaudeLLM().json(args)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toEqual({
      "x-api-key": "test-anthropic-key",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe("custom-claude-model");
    expect(body.max_tokens).toBe(8192);
    expect(body.system).toContain(args.system);
    expect(body.system).toContain('"ok"');
    expect(body.messages).toEqual([{ role: "user", content: args.user }]);
    expect(body.response_format).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain("old-provider-secret");
  });

  it("defaults to Claude without depending on old provider configuration", () => {
    vi.stubEnv("ANTHROPIC_MODEL", undefined);
    vi.stubEnv("LLM_MODEL", "old-model");
    expect(config().ANTHROPIC_MODEL).toBe("claude-sonnet-5-5");
  });

  it("ignores thinking blocks and joins text content blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          content: [
            {
              type: "thinking",
              thinking: "Private reasoning",
              signature: "signature",
            },
            { type: "text", text: '{"ok":' },
            { type: "text", text: "true}" },
          ],
          stop_reason: "end_turn",
        }),
      ),
    );
    expect(await new ClaudeLLM().json(args)).toEqual({ ok: true });
  });

  it("accepts a fenced JSON object defensively", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(message('```json\n{"ok":true}\n```')),
    );
    expect(await new ClaudeLLM().json(args)).toEqual({ ok: true });
  });

  it.each(["invalid JSON", '{"ok":"not a boolean"}', "{}"])(
    "retries invalid model output once: %s",
    async (invalid) => {
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(message(invalid))
        .mockResolvedValueOnce(message('{"ok":true}'));
      vi.stubGlobal("fetch", fetch);
      expect(await new ClaudeLLM().json(args)).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledTimes(2);
      const second = JSON.parse(fetch.mock.calls[1][1].body);
      expect(second.messages[0].content).toContain(
        "previous response was invalid",
      );
    },
  );

  it("rejects repeated invalid output rather than returning unchecked data", async () => {
    const fetch = vi.fn().mockImplementation(async () => message("{}"));
    vi.stubGlobal("fetch", fetch);
    await expect(new ClaudeLLM().json(args)).rejects.toThrow("twice");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("validates refinements, not just JSON shape", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => message('{"ok":false}'));
    vi.stubGlobal("fetch", fetch);
    await expect(
      new ClaudeLLM().json({
        ...args,
        schema: args.schema.refine((value) => value.ok, "Must be true"),
      }),
    ).rejects.toThrow("twice");
  });

  it("retries token-truncated output with a larger limit, even if JSON looks complete", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(message('{"ok":false}', "max_tokens"))
      .mockResolvedValueOnce(message('{"ok":true}'));
    vi.stubGlobal("fetch", fetch);
    expect(await new ClaudeLLM().json(args)).toEqual({ ok: true });
    expect(JSON.parse(fetch.mock.calls[1][1].body).max_tokens).toBe(16384);
  });

  it.each([
    { stop_reason: "refusal" },
    { stop_reason: "end_turn", stop_details: { type: "refusal" } },
  ])("does not retry a refusal: %j", async (stop) => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        content: [{ type: "text", text: '{"ok":true}' }],
        ...stop,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(new ClaudeLLM().json(args)).rejects.toThrow("declined");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { content: [], stop_reason: "end_turn" },
    {
      content: [{ type: "text", text: '{"ok":true}' }],
      stop_reason: "tool_use",
    },
    { choices: [{ message: { content: '{"ok":true}' } }] },
  ])(
    "rejects missing text, unfinished responses and old response shapes: %j",
    async (body) => {
      const fetch = vi.fn().mockImplementation(async () => Response.json(body));
      vi.stubGlobal("fetch", fetch);
      await expect(new ClaudeLLM().json(args)).rejects.toThrow("twice");
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it.each([401, 403, 429, 529])(
    "reports HTTP %s without exposing provider bodies",
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: "sensitive provider data" } },
            { status },
          ),
        );
      vi.stubGlobal("fetch", fetch);
      const pending = new ClaudeLLM().json(args);
      await expect(pending).rejects.toThrow(`HTTP ${status}`);
      await expect(pending).rejects.not.toThrow("sensitive provider data");
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("does not surface unreadable API response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("sensitive provider data")),
    );
    await expect(new ClaudeLLM().json(args)).rejects.toThrow(
      "unreadable API response",
    );
  });

  it("requires the Anthropic key before making any request", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", " ");
    vi.stubEnv("LLM_API_KEY", "old-provider-key");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(new ClaudeLLM().json(args)).rejects.toThrow(
      "ANTHROPIC_API_KEY",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
