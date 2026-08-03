"use server";

import { getModelIntegrationConfig } from "@/models";

function getOpenCodeRows(config) {
  return config.tools?.opencode?.rows || (config.tool === "opencode" ? config.rows : []);
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
    const baseUrl = request?.nextUrl?.searchParams?.get("baseUrl")
      || config?.baseUrl
      || "https://route9.nurset-studio.web.id/v1";
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
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 },
    );
  }
}
