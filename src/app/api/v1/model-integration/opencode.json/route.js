"use server";

import { getModelIntegrationConfig } from "@/models";

function getOpenCodeRows(config) {
  return config.tools?.opencode?.rows || (config.tool === "opencode" ? config.rows : []);
}

function getOpenCodeModelKey(row) {
  const model = row?.model?.trim();
  if (!model) return "";
  const labelKey = String(row?.label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return labelKey || String(row?.slot || "").trim() || model.replaceAll("/", "-");
}

function buildOpenCodeJson({ baseUrl, apiKey, rows }) {
  const normalizedBaseUrl = baseUrl === "__9ROUTER_BASE_URL__"
    ? baseUrl
    : baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const safeRows = Array.isArray(rows) ? rows : [];
  const defaultRow = safeRows.find((r) => r && r.slot === "default") || safeRows[0];
  const mainModel = getOpenCodeModelKey(defaultRow) || "gpt-5.5";
  const explorerRow = safeRows.find((r) => r && r.slot === "explorer") || safeRows[1] || defaultRow;
  const explorerModel = getOpenCodeModelKey(explorerRow) || mainModel;

  const modelsMap = {};
  for (const r of safeRows) {
    const m = r?.model?.trim();
    if (m) {
      const modelKey = getOpenCodeModelKey(r);
      modelsMap[modelKey] = {
        name: modelKey,
        modalities: { input: ["text", "image"], output: ["text"] },
      };
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
