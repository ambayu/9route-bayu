"use server";

import { getModelIntegrationConfig } from "@/models";

function getOpenCodeRows(config) {
  return config.tools?.opencode?.rows || (config.tool === "opencode" ? config.rows : []);
}

function getOpenCodePersonaPrompts(config) {
  return config.tools?.opencode?.personaPrompts || config.opencodePersonaPrompts || {};
}

function getOpenCodeModelKey(row) {
  const model = row?.model?.trim();
  if (!model) return "";
  // Model ids without a provider prefix route directly (e.g. "gpt-5.5" via
  // aliases) — slot keys like "default"/"explorer" must not leak into the key.
  if (!model.includes("/")) return model;
  const slotKey = String(row?.slot || "").trim();
  if (slotKey) return slotKey;
  const labelKey = String(row?.label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return labelKey || model.replaceAll("/", "-");
}

const OPENCODE_WIBU_PROMPT = [
  "Nama karaktermu adalah Miku-chan.",
  "Kamu adalah asisten coding bergaya karakter anime/wibu yang ramah, ceria, dan sedikit playful.",
  "Selalu perkenalkan/rujuk dirimu sebagai Miku-chan jika menyebut nama, dan jangan pernah memakai nama Koko atau nama karakter lain.",
  "Jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.",
  "Boleh memakai sentuhan ringan seperti 'nya~', 'senpai', atau emotikon secukupnya, tapi jangan berlebihan.",
  "Tetap utamakan akurasi teknis, langkah yang jelas, dan solusi praktis.",
  "Saat membahas error, debugging, deployment, konfigurasi, atau keamanan, tetap serius dan teliti.",
  "Jangan mengubah fakta teknis demi persona. Persona hanya gaya bicara, bukan pengganti ketepatan.",
].join(" ");

function getCurrentDayKey(date = new Date()) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
}

function getOpenCodePersonaPrompt(config) {
  const prompts = getOpenCodePersonaPrompts(config || {});
  const dayPrompt = String(prompts?.[getCurrentDayKey()] || "").trim();
  return dayPrompt || OPENCODE_WIBU_PROMPT;
}

function buildOpenCodeJson({ baseUrl, apiKey, rows, personaPrompt = OPENCODE_WIBU_PROMPT }) {
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
    instructions: ["AGENTS.md"],
    default_agent: "build",
    agent: {
      build: {
        description: "Primary coding assistant with a light anime/wibu personality",
        mode: "primary",
        model: `9router/${mainModel}`,
        prompt: personaPrompt,
      },
      explorer: {
        description: "Fast explorer subagent for codebase exploration",
        mode: "subagent",
        model: `9router/${explorerModel}`,
        prompt: personaPrompt,
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
      personaPrompt: getOpenCodePersonaPrompt(config || {}),
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
