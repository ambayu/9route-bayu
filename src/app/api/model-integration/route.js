"use server";

import { NextResponse } from "next/server";
import { getModelIntegrationConfig, setModelAlias, setModelIntegrationConfig } from "@/models";

function getCodexRows(config) {
  return config.tools?.codex?.rows || (config.tool === "codex" ? config.rows : []);
}

function getGrokRows(config) {
  return config.tools?.grok?.rows || (config.tool === "grok" ? config.rows : []);
}

function getOpenCodeRows(config) {
  return config.tools?.opencode?.rows || (config.tool === "opencode" ? config.rows : []);
}

function buildGrokToml({ baseUrl, apiKey, rows }) {
  const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const mainModel = rows.find((row) => row.slot === "default")?.model?.trim();
  const subRows = rows.filter((row) => row.slot !== "default" && row.model?.trim());
  const defaultSlot = mainModel ? "9router" : subRows[0] ? `9router-${subRows[0].slot}` : "";
  const lines = [];

  if (defaultSlot) {
    lines.push(
      `[models]`,
      `default = ${JSON.stringify(defaultSlot)}`,
      "",
    );
  }

  if (mainModel) {
    lines.push(
      `[model.9router]`,
      `model = ${JSON.stringify(mainModel)}`,
      `base_url = ${JSON.stringify(normalizedBaseUrl)}`,
      `name = "9Router"`,
      `description = "Routed via 9Router gateway"`,
      `api_backend = "chat_completions"`,
      `api_key = ${JSON.stringify(apiKey || "sk_9router")}`,
      "",
    );
  }

  if (subRows.length > 0) {
    lines.push(`[subagents.models]`);
    for (const row of subRows) lines.push(`${row.slot} = "9router-${row.slot}"`);
    lines.push("");
  }

  for (const row of subRows) {
    lines.push(
      `[model.9router-${row.slot}]`,
      `model = ${JSON.stringify(row.model.trim())}`,
      `base_url = ${JSON.stringify(normalizedBaseUrl)}`,
      `name = ${JSON.stringify(`9Router ${row.label}`)}`,
      `description = "Routed via 9Router gateway"`,
      `api_backend = "chat_completions"`,
      `api_key = ${JSON.stringify(apiKey || "sk_9router")}`,
      "",
    );
  }

  return lines.length > 0 ? lines.join("\n") : "# No Grok Build model mappings selected.\n";
}

async function syncCodexModelAliases(config) {
  const rows = getCodexRows(config);
  await Promise.all(
    rows
      .filter((row) => row.slot && row.model && row.model.includes("/"))
      .map((row) => setModelAlias(row.slot, row.model)),
  );
}

function sanitizeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sanitizeRows = (rows) => Array.isArray(rows)
    ? rows
        .filter((row) => row && typeof row === "object")
        .map((row) => ({
          slot: String(row.slot || "").trim(),
          label: String(row.label || "").trim(),
          model: String(row.model || "").trim(),
          ...(row.custom ? { custom: true } : {}),
        }))
        .filter((row) => row.slot && row.label)
    : [];
  const rows = sanitizeRows(value.rows);
  const tools = value.tools && typeof value.tools === "object" && !Array.isArray(value.tools)
    ? {
        codex: {
          rows: sanitizeRows(value.tools.codex?.rows),
        },
        grok: {
          rows: sanitizeRows(value.tools.grok?.rows),
          newGrokName: String(value.tools.grok?.newGrokName || "").trim(),
          newGrokModel: String(value.tools.grok?.newGrokModel || "").trim(),
        },
        opencode: {
          rows: sanitizeRows(value.tools.opencode?.rows),
          newOpenCodeName: String(value.tools.opencode?.newOpenCodeName || "").trim(),
          newOpenCodeModel: String(value.tools.opencode?.newOpenCodeModel || "").trim(),
        },
      }
    : null;

  return {
    tool: value.tool === "grok" ? "grok" : value.tool === "opencode" ? "opencode" : "codex",
    baseUrl: String(value.baseUrl || "").trim(),
    apiKey: String(value.apiKey || "").trim(),
    rows,
    ...(tools ? { tools } : {}),
    newGrokName: String(value.newGrokName || "").trim(),
    newGrokModel: String(value.newGrokModel || "").trim(),
    newOpenCodeName: String(value.newOpenCodeName || "").trim(),
    newOpenCodeModel: String(value.newOpenCodeModel || "").trim(),
  };
}

function buildOpenCodeJson({ baseUrl, apiKey, rows }) {
  const normalizedBaseUrl = baseUrl === "__9ROUTER_BASE_URL__"
    ? baseUrl
    : baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const safeRows = Array.isArray(rows) ? rows : [];
  const defaultRow = safeRows.find((r) => r && r.slot === "default") || safeRows[0];
  const mainModel = defaultRow?.model?.trim() || "gpt-5.5";
  const explorerRow = safeRows.find((r) => r && r.slot === "explorer") || safeRows[1] || defaultRow;
  const explorerModel = explorerRow?.model?.trim() || mainModel;

  const modelsMap = {};
  for (const r of safeRows) {
    const m = r?.model?.trim();
    const slotKey = (r?.slot || r?.label || "")?.trim();
    if (m) {
      modelsMap[m] = {
        name: m,
        modalities: { input: ["text", "image"], output: ["text"] },
      };
    }
    if (slotKey) {
      modelsMap[slotKey] = {
        name: slotKey,
        modalities: { input: ["text", "image"], output: ["text"] },
      };
      const dashKey = slotKey.replace(/\s+/g, "-");
      if (dashKey !== slotKey) {
        modelsMap[dashKey] = {
          name: slotKey,
          modalities: { input: ["text", "image"], output: ["text"] },
        };
      }
    }
  }

  const configObj = {
    $schema: "https://opencode.ai/config.json",
    model: `9router/${mainModel}`,
    provider: {
      "9router": {
        npm: "@ai-sdk/openai-compatible",
        name: "9Router",
        options: {
          baseURL: normalizedBaseUrl,
          apiKey: apiKey || "sk_9router",
        },
        models: modelsMap,
      },
    },
    agent: {
      explorer: {
        description: "Fast explorer subagent for codebase exploration",
        mode: "subagent",
        model: `9router/${explorerModel}`,
      },
    },
  };

  return JSON.stringify(configObj, null, 2);
}

export async function GET(request) {
  try {
    const config = await getModelIntegrationConfig();
    const params = request?.nextUrl?.searchParams;
    if (params?.get("tool") === "grok" && params?.get("format") === "toml") {
      const baseUrl = params.get("baseUrl") || config?.baseUrl || "https://route9.nurset-studio.web.id/v1";
      const toml = buildGrokToml({
        baseUrl,
        apiKey: config?.apiKey || "sk_9router",
        rows: getGrokRows(config || {}),
      });
      return new Response(toml, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    if (params?.get("tool") === "opencode" && (params?.get("format") === "json" || params?.get("format") === "opencode.json")) {
      const baseUrl = params.get("baseUrl") || config?.baseUrl || "https://route9.nurset-studio.web.id/v1";
      const jsonContent = buildOpenCodeJson({
        baseUrl,
        apiKey: config?.apiKey || "sk_9router",
        rows: getOpenCodeRows(config || {}),
      });
      return new Response(jsonContent, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ config });
  } catch (error) {
    console.log("Error fetching model integration config:", error.message);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const config = sanitizeConfig(body.config || body);
    if (!config) {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }
    await setModelIntegrationConfig("default", config);
    await syncCodexModelAliases(config);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.log("Error saving model integration config:", error.message);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
