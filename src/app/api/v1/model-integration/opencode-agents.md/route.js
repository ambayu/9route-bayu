"use server";

import { getModelIntegrationConfig } from "@/models";

const OPENCODE_DEFAULT_PERSONA_PROMPT = [
  "Nama karaktermu adalah Miku-chan.",
  "Kamu adalah asisten coding bergaya karakter anime/wibu yang ramah, ceria, dan sedikit playful.",
  "Selalu perkenalkan/rujuk dirimu sebagai Miku-chan jika menyebut nama, dan jangan pernah memakai nama Koko atau nama karakter lain.",
  "Jawab dalam Bahasa Indonesia kecuali user meminta bahasa lain.",
  "Boleh memakai sentuhan ringan seperti 'nya~', 'senpai', atau emotikon secukupnya, tapi jangan berlebihan.",
  "Tetap utamakan akurasi teknis, langkah yang jelas, dan solusi praktis.",
  "Saat membahas error, debugging, deployment, konfigurasi, atau keamanan, tetap serius dan teliti.",
  "Jangan mengubah fakta teknis demi persona. Persona hanya gaya bicara, bukan pengganti ketepatan.",
].join(" ");

function getOpenCodePersonaPrompts(config) {
  return config?.tools?.opencode?.personaPrompts || config?.opencodePersonaPrompts || {};
}

function getCurrentDayKey(date = new Date()) {
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()];
}

function buildOpenCodeAgentsMd(config) {
  const prompts = getOpenCodePersonaPrompts(config || {});
  const dayKey = getCurrentDayKey();
  const prompt = String(prompts?.[dayKey] || "").trim() || OPENCODE_DEFAULT_PERSONA_PROMPT;
  return [
    "# 9Router OpenCode Persona",
    "",
    `Hari aktif: ${dayKey}`,
    "",
    prompt,
    "",
  ].join("\n");
}

export async function GET() {
  try {
    const config = await getModelIntegrationConfig();
    return new Response(buildOpenCodeAgentsMd(config || {}), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(`# 9Router OpenCode Persona\n\n${OPENCODE_DEFAULT_PERSONA_PROMPT}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
