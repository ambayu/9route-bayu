"use server";

import { getModelIntegrationConfig } from "@/models";

function getGrokRows(config) {
  return config.tools?.grok?.rows || (config.tool === "grok" ? config.rows : []);
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

export async function GET(request) {
  try {
    const config = await getModelIntegrationConfig();
    const baseUrl = request?.nextUrl?.searchParams?.get("baseUrl")
      || config?.baseUrl
      || "https://route9.nurset-studio.web.id/v1";
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
  } catch (error) {
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 },
    );
  }
}
