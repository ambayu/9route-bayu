"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { getApiKeys, getSettings, updateSettings } from "@/lib/localDb";

const execAsync = promisify(exec);

const PROVIDER_NAME = "9router";
const MODEL_SLOT = "9router";
const BUILTIN_DEFAULT = "grok-build";

// [model.9router] ... until next [section] header or EOF
const MODEL_SECTION_RE = new RegExp(
  `^\\[model\\.${MODEL_SLOT}\\][ \\t]*\\r?\\n(?:(?!\\[)[^\\r\\n]*\\r?\\n?)*`,
  "m"
);

const MODELS_SECTION_RE = /^\[models\][ \t]*\r?\n((?:(?!\[)[^\r\n]*\r?\n?)*)/m;

// Marker written on Apply so Reset can restore the previous [models].default
const PREV_DEFAULT_RE = /^# 9router-prev-default = "([^"]*)"[ \t]*\r?\n?/m;

const getGrokDir = () => path.join(os.homedir(), ".grok");
const getGrokConfigPath = () => path.join(getGrokDir(), "config.toml");
const getGrokBinPath = () => path.join(getGrokDir(), "bin", "grok");

const checkGrokInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where grok" : "which grok";
    await execAsync(command, { windowsHide: true });
    return true;
  } catch {
    try {
      await fs.access(getGrokBinPath());
      return true;
    } catch {
      try {
        await fs.access(getGrokConfigPath());
        return true;
      } catch {
        return false;
      }
    }
  }
};

const readConfigToml = async () => {
  try {
    return await fs.readFile(getGrokConfigPath(), "utf-8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
};

const getTomlField = (body, key) => {
  const m = body.match(new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*"([^"]*)"`, "m"));
  return m ? m[1] : null;
};

const parseModelSection = (toml) => {
  const match = toml.match(MODEL_SECTION_RE);
  if (!match) return null;
  const body = match[0].replace(/^\[model\.[^\]]+\][ \t]*\r?\n/, "");
  return {
    model: getTomlField(body, "model"),
    base_url: getTomlField(body, "base_url"),
    name: getTomlField(body, "name"),
    api_key: getTomlField(body, "api_key"),
    api_backend: getTomlField(body, "api_backend"),
  };
};

const parseModelsDefault = (toml) => {
  const match = toml.match(MODELS_SECTION_RE);
  if (!match) return null;
  return getTomlField(match[1] || "", "default");
};

const buildModelSection = (model, baseUrl, apiKey) => {
  const lines = [
    `[model.${MODEL_SLOT}]`,
    `model = "${model}"`,
    `base_url = "${baseUrl}"`,
    `name = "9Router"`,
    `description = "Routed via 9Router gateway"`,
    `api_backend = "chat_completions"`,
  ];
  if (apiKey) lines.push(`api_key = "${apiKey}"`);
  return `${lines.join("\n")}\n`;
};

const upsertModelSection = (toml, section) => {
  if (MODEL_SECTION_RE.test(toml)) return toml.replace(MODEL_SECTION_RE, section);
  const needsNl = toml.length > 0 && !toml.endsWith("\n");
  return `${toml}${needsNl ? "\n" : ""}\n${section}`;
};

const removeModelSection = (toml) =>
  toml.replace(MODEL_SECTION_RE, "").replace(/\n{3,}/g, "\n\n");

// Set or insert default = "..." inside existing [models], or create the section
const setModelsDefault = (toml, value) => {
  const match = toml.match(MODELS_SECTION_RE);
  if (match) {
    const body = match[1] || "";
    let newBody;
    if (/^[ \t]*default[ \t]*=/m.test(body)) {
      newBody = body.replace(/^[ \t]*default[ \t]*=[ \t]*"[^"]*"/m, `default = "${value}"`);
    } else {
      newBody = `default = "${value}"\n${body}`;
    }
    return toml.replace(match[0], `[models]\n${newBody}`);
  }
  const block = `[models]\ndefault = "${value}"\n\n`;
  return toml.length > 0 ? block + toml : block;
};

// Remember the previous default once (so re-Apply does not overwrite it with "9router")
const rememberPrevDefault = (toml) => {
  if (PREV_DEFAULT_RE.test(toml)) return toml;
  const current = parseModelsDefault(toml);
  if (!current || current === MODEL_SLOT) return toml;
  const marker = `# 9router-prev-default = "${current}"\n`;
  // Prefer placing the marker just above [model.9router] if present, else at EOF
  if (MODEL_SECTION_RE.test(toml)) {
    return toml.replace(MODEL_SECTION_RE, (section) => marker + section);
  }
  const needsNl = toml.length > 0 && !toml.endsWith("\n");
  return `${toml}${needsNl ? "\n" : ""}${marker}`;
};

// If default points at our slot, restore previous (or built-in) default and drop marker
const clearModelsDefaultIfOurs = (toml) => {
  const prevMatch = toml.match(PREV_DEFAULT_RE);
  const restoreTo = prevMatch?.[1] || BUILTIN_DEFAULT;
  let next = toml.replace(PREV_DEFAULT_RE, "");
  const current = parseModelsDefault(next);
  if (current === MODEL_SLOT) {
    next = setModelsDefault(next, restoreTo);
  }
  return next;
};

const has9RouterConfig = (modelCfg) => {
  if (!modelCfg?.base_url) return false;
  return true;
};

export async function GET(request) {
  try {
    const url = request ? new URL(request.url) : null;
    const action = url ? url.searchParams.get("action") : null;

    if (action === "download-switcher" && request) {
      const searchParams = url.searchParams;
      const paramBaseUrl = searchParams.get("baseUrl");
      const paramApiKey = searchParams.get("apiKey");
      const paramModel = searchParams.get("model");
      const paramCustomModels = searchParams.get("models") || "";

      const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:20127";
      let proto = request.headers.get("x-forwarded-proto") || "http";
      if (host.includes("umnaw.ac.id") || host.endsWith(":443")) proto = "https";
      const basePath = "/route9";
      
      const vpsBaseUrl = paramBaseUrl || `${proto}://${host}${basePath}/v1`;
      const localBaseUrl = "http://localhost:20127/v1";

      // Fetch first active API key for VPS access
      let vpsApiKey = paramApiKey;
      if (!vpsApiKey) {
        vpsApiKey = "sk_9router";
        try {
          const apiKeys = await getApiKeys();
          const activeKey = apiKeys.find(k => k.isActive);
          if (activeKey?.key) vpsApiKey = activeKey.key;
        } catch { /* fallback */ }
      }

      const defaultModel = paramModel || "gpt-5.5";

      let customSections = "";
      if (paramCustomModels) {
        const modelsList = paramCustomModels.split(",").map(m => m.trim()).filter(Boolean);
        for (const m of modelsList) {
          const parts = m.split(":");
          const name = parts[0];
          const target = parts[1] || name;
          customSections += `\n$c += "\`r\`n\`r\`n[model.\`"${name}\`"]\`r\`nmodel = \`"${target}\`"\`r\`nbase_url = \`"${vpsBaseUrl}\`"\`r\`nname = \`"${name}\`"\`r\`ndescription = \`"9Router model alias\`"\`r\`napi_backend = \`"chat_completions\`"\`r\`napi_key = \`"${vpsApiKey}\`"\`r\`n"`;
        }
      }

      const psScript = `$configPath = Join-Path $env:USERPROFILE '.grok\\config.toml'

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "      Grok Build Endpoint Switcher (9Router)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Select target 9Router server:"
Write-Host " [1] Local 9Router (${localBaseUrl})"
Write-Host " [2] Remote 9Router  (${vpsBaseUrl})"
Write-Host " [3] Original xAI Grok (Default Official)"
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
$choice = Read-Host "Enter choice (1, 2, or 3)"

if ($choice -eq '1') {
    $newUrl   = "${localBaseUrl}"
    $label    = "Local 9Router"
    $apiKey   = "sk_9router"
} elseif ($choice -eq '2') {
    $newUrl   = "${vpsBaseUrl}"
    $label    = "Remote 9Router"
    $apiKey   = "${vpsApiKey}"
} elseif ($choice -eq '3') {
    Write-Host "Reverting to xAI default..." -ForegroundColor Yellow
    if (Test-Path $configPath) {
        $c = Get-Content $configPath -Raw
        $c = $c -replace '(?s)\\[model\\.[^\\]]*\\].*?base_url\\s*=\\s*"[^"]*route9[^"]*".*?(?=\\r?\\n\\[|\\Z)', ''
        $c = $c -replace '(?s)\\[model\\.9router-local[^\\]]*\\].*?(?=\\r?\\n\\[|\\Z)', ''
        $c = $c -replace 'default\\s*=\\s*"9router[^"]*"', 'default = "grok-build"'
        $c = $c -replace '\\n{3,}', "\\n\\n"
        Set-Content $configPath $c.Trim()
    }
    Write-Host "Grok config restored to xAI default" -ForegroundColor Green
    Pause; Exit
} else {
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    Pause; Exit
}

if (-not (Test-Path $configPath)) {
    New-Item -ItemType File -Path $configPath -Force | Out-Null
}

$c = Get-Content $configPath -Raw
if ($null -eq $c) { $c = '' }

# Remove old 9router model sections
$c = $c -replace '(?s)\\[model\\.[^\\]]*\\].*?base_url\\s*=\\s*"[^"]*route9[^"]*".*?(?=\\r?\\n\\[|\\Z)', ''
$c = $c -replace '(?s)\\[model\\.9router-local\\].*?(?=\\r?\\n\\[|\\Z)', ''
$c = $c.Trim()

# Add model slots for both local and VPS
$localSection = \"\`r\`n\`r\`n[model.9router-local]\`r\`nmodel = \`\"${defaultModel}\`\"\`r\`nbase_url = \`\"${localBaseUrl}\`\"\`r\`nname = \`\"9Router Local\`\"\`r\`ndescription = \`\"Local 9Router gateway\`\"\`r\`napi_backend = \`\"chat_completions\`\"\`r\`napi_key = \`\"sk_9router\`\"\`r\`n\"
$vpsSection   = \"\`r\`n\`r\`n[model.9router-vps]\`r\`nmodel = \`\"${defaultModel}\`\"\`r\`nbase_url = \`\"${vpsBaseUrl}\`\"\`r\`nname = \`\"9Router VPS\`\"\`r\`ndescription = \`\"Remote 9Router gateway\`\"\`r\`napi_backend = \`\"chat_completions\`\"\`r\`napi_key = \`\"${vpsApiKey}\`\"\`r\`n\"
$c += $localSection + $vpsSection
${customSections}

# Update or add [models] default
if ($c -match '(?m)^\\[models\\]') {
    $c = $c -replace '(?m)^default\\s*=\\s*"[^"]*"', \"default = \`\"9router-vps\`\"\"
    if ($c -notmatch '(?m)^default\\s*=') {
        $c = $c -replace '(?m)(^\\[models\\])', \"\\$1\`r\`ndefault = \`\"9router-vps\`\"\"
    }
} else {
    $c = \"[models]\`r\`ndefault = \`\"9router-vps\`\"\`r\`n\" + $c
}

if (\"$newUrl\" -eq \"${localBaseUrl}\") {
    $c = $c -replace 'default\\s*=\\s*"9router-vps"', 'default = "9router-local"'
}

Set-Content $configPath $c

Write-Host ""
Write-Host "[SUCCESS] Grok Build config updated!" -ForegroundColor Green
Write-Host "  Default model slot : $label ($newUrl)" -ForegroundColor Green
Write-Host "  Both slots added    : 9router-local + 9router-vps" -ForegroundColor Green
Write-Host "  Switch anytime with: grok -m 9router-local  OR  grok -m 9router-vps" -ForegroundColor Cyan
Write-Host ""
Pause`;

      const buffer = Buffer.from(psScript, 'utf16le');
      const base64 = buffer.toString('base64');
      const scriptContent = `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${base64}\r\n`;
      return new NextResponse(scriptContent, {
        headers: {
          "Content-Type": "application/x-bat",
          "Content-Disposition": 'attachment; filename="switch-grok-endpoint.bat"',
        },
      });
    }

    const dbSettings = await getSettings();
    const savedSlots = dbSettings?.grokBuildSettings?.modelSlots || [];

    const installed = await checkGrokInstalled();
    if (!installed) {
      return NextResponse.json({
        installed: false,
        settings: null,
        message: "Grok Build is not installed",
        savedSlots,
      });
    }

    const toml = await readConfigToml();
    const model = parseModelSection(toml);
    const defaultModel = parseModelsDefault(toml);

    return NextResponse.json({
      installed: true,
      settings: {
        model,
        default: defaultModel,
      },
      has9Router: has9RouterConfig(model),
      configPath: getGrokConfigPath(),
      savedSlots,
    });
  } catch (error) {
    console.log("Error checking grok-build settings:", error);
    return NextResponse.json({ error: "Failed to check grok-build settings" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, modelSlots } = await request.json();

    // Persist slots to DB settings
    if (modelSlots !== undefined) {
      await updateSettings({
        grokBuildSettings: {
          modelSlots: modelSlots || []
        }
      });
    }

    if (baseUrl && model) {
      const dir = getGrokDir();
      await fs.mkdir(dir, { recursive: true });

      const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      const keyToWrite = apiKey || "sk_9router";

      let toml = await readConfigToml();
      toml = rememberPrevDefault(toml);
      toml = upsertModelSection(toml, buildModelSection(model, normalizedBaseUrl, keyToWrite));
      toml = setModelsDefault(toml, MODEL_SLOT);

      await fs.writeFile(getGrokConfigPath(), toml);
    }

    return NextResponse.json({
      success: true,
      message: "Grok Build settings applied and saved successfully!",
      configPath: getGrokConfigPath(),
      modelSlot: MODEL_SLOT,
    });
  } catch (error) {
    console.log("Error updating grok-build settings:", error);
    return NextResponse.json({ error: "Failed to update grok-build settings" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const configPath = getGrokConfigPath();
    let toml = "";
    try {
      toml = await fs.readFile(configPath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({ success: true, message: "No config file to reset" });
      }
      throw error;
    }

    toml = removeModelSection(toml);
    toml = clearModelsDefaultIfOurs(toml);
    await fs.writeFile(configPath, toml);

    return NextResponse.json({
      success: true,
      message: `${PROVIDER_NAME} model slot removed from Grok Build`,
    });
  } catch (error) {
    console.log("Error resetting grok-build settings:", error);
    return NextResponse.json({ error: "Failed to reset grok-build settings" }, { status: 500 });
  }
}
