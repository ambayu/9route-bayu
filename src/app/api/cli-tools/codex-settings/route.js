"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseTOML, stringifyTOML } from "confbox";
import { getModelAliases } from "@/lib/localDb";

const CODEX_ALIAS_KEYS = [
  "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
  "5.6-sol", "5.6-terra", "5.6-luna",
  "gpt-5.6", "5.6",
  "gpt-5.5", "5.5",
  "gpt-5.4", "5.4",
  "gpt-5.4-mini", "5.4-mini",
  "gpt-5.3-codex", "gpt-5.3", "5.3",
  "gpt-5.2", "5.2"
];

const execAsync = promisify(exec);

const getCodexDir = () => path.join(os.homedir(), ".codex");
const getCodexConfigPath = () => path.join(getCodexDir(), "config.toml");
const getCodexAuthPath = () => path.join(getCodexDir(), "auth.json");

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj) => obj ?? {};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj, dottedKey, value) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj, dottedKey) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  delete cur[keys[keys.length - 1]];
};

// Check if codex CLI is installed (via which/where or config file exists)
const checkCodexInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getCodexConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current config.toml
const readConfig = async () => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has 9Router settings
const has9RouterConfig = (config) => {
  if (!config) return false;
  return config.includes("model_provider = \"9router\"") || config.includes("[model_providers.9router]");
};

// GET - Check codex CLI and read current settings
export async function GET(request) {
  try {
    const url = request ? new URL(request.url) : null;
    const action = url ? url.searchParams.get("action") : null;

    if (action === "download-switcher" && request) {
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:20127";
      let proto = request.headers.get("x-forwarded-proto") || "http";
      // Auto-detect secure connection if host has standard SSL indicators or port is 443
      if (host.includes("umnaw.ac.id") || host.endsWith(":443")) {
        proto = "https";
      }
      const basePath = "/route9"; // Standard deployment path prefix
      const displayUrl = `${proto}://${host}${basePath}/v1`;

      const scriptContent = `@echo off
set "temp_ps1=%temp%\\temp_switch.ps1"

echo $configPath = Join-Path $env:USERPROFILE '.codex\\config.toml' > "%temp_ps1%"
echo $authPath = Join-Path $env:USERPROFILE '.codex\\auth.json' >> "%temp_ps1%"
echo if (-not (Test-Path $configPath)) { >> "%temp_ps1%"
echo     Write-Host "Codex config file not found" -ForegroundColor Red >> "%temp_ps1%"
echo     Pause; Exit >> "%temp_ps1%"
echo } >> "%temp_ps1%"
echo Write-Host "==================================================" -ForegroundColor Cyan >> "%temp_ps1%"
echo Write-Host "       Codex Endpoint Switcher (9Router)" -ForegroundColor Cyan >> "%temp_ps1%"
echo Write-Host "==================================================" -ForegroundColor Cyan >> "%temp_ps1%"
echo Write-Host "" >> "%temp_ps1%"
echo Write-Host "Select target 9Router server:" >> "%temp_ps1%"
echo Write-Host " [1] Local 9Router (http://localhost:20127/v1)" >> "%temp_ps1%"
echo Write-Host " [2] Remote 9Router   (${displayUrl})" >> "%temp_ps1%"
echo Write-Host " [3] Original Codex API (Default Official)" >> "%temp_ps1%"
echo Write-Host "" >> "%temp_ps1%"
echo Write-Host "==================================================" -ForegroundColor Cyan >> "%temp_ps1%"
echo $choice = Read-Host "Enter choice (1, 2, or 3)" >> "%temp_ps1%"
echo if ($choice -eq '1') { >> "%temp_ps1%"
echo     $newUrl = "http://localhost:20127/v1" >> "%temp_ps1%"
echo     $label = "Local 9Router" >> "%temp_ps1%"
echo } elseif ($choice -eq '2') { >> "%temp_ps1%"
echo     $newUrl = "${displayUrl}" >> "%temp_ps1%"
echo     $label = "Remote 9Router" >> "%temp_ps1%"
echo } elseif ($choice -eq '3') { >> "%temp_ps1%"
echo     $c = Get-Content $configPath -Raw >> "%temp_ps1%"
echo     $c = $c -replace 'model_provider\\s*=\\s*\"9router\"\\s*\\r?\\n?', '' >> "%temp_ps1%"
echo     $c = $c -replace '(?s)\\[model_providers\\.9router\\].*?(?=\\r?\\n\\[|\\Z)', '' >> "%temp_ps1%"
echo     $c = $c -replace '(?s)\\[agents\\.subagent\\].*?(?=\\r?\\n\\[|\\Z)', '' >> "%temp_ps1%"
echo     Set-Content $configPath $c.Trim() >> "%temp_ps1%"
echo     if (Test-Path $authPath) { >> "%temp_ps1%"
echo         $j = Get-Content $authPath | ConvertFrom-Json >> "%temp_ps1%"
echo         $j.psobject.properties.remove('OPENAI_API_KEY') >> "%temp_ps1%"
echo         $j.psobject.properties.remove('auth_mode') >> "%temp_ps1%"
echo         if (($j ^| Get-Member -MemberType NoteProperty).Count -eq 0) { Remove-Item $authPath } else { $j ^| ConvertTo-Json ^| Set-Content $authPath } >> "%temp_ps1%"
echo     } >> "%temp_ps1%"
echo     Write-Host "Restored to official settings" -ForegroundColor Green >> "%temp_ps1%"
echo     Pause; Exit >> "%temp_ps1%"
echo } else { >> "%temp_ps1%"
echo     Write-Host "Invalid choice" -ForegroundColor Red; Pause; Exit >> "%temp_ps1%"
echo } >> "%temp_ps1%"
echo $c = Get-Content $configPath -Raw >> "%temp_ps1%"
echo if ($c -notlike '*model_provider = "9router"*') { >> "%temp_ps1%"
echo     $c += "\`r\`nmodel_provider = \`"9router\`\"\`r\`n\`r\`n[model_providers.9router]\`r\`nname = \`"9Router\`\"\`r\`nbase_url = \`"\`\"\`r\`nwire_api = \`"responses\`\"\`r\`n" >> "%temp_ps1%"
echo } >> "%temp_ps1%"
echo $c = $c -replace '(base_url\\s*=\\s*\")[^\"]*(\")', "\`$1$newUrl\`$2" >> "%temp_ps1%"
echo Set-Content $configPath $c >> "%temp_ps1%"
echo Write-Host "" >> "%temp_ps1%"
echo Write-Host "[SUCCESS] Codex config updated to point to: $label ($newUrl)" -ForegroundColor Green >> "%temp_ps1%"
echo Write-Host "" >> "%temp_ps1%"
echo Pause >> "%temp_ps1%"

powershell -NoProfile -ExecutionPolicy Bypass -File "%temp_ps1%"
del "%temp_ps1%"
`;
`;
      return new NextResponse(scriptContent, {
        headers: {
          "Content-Type": "application/x-bat",
          "Content-Disposition": "attachment; filename=\"switch-endpoint.bat\"",
        },
      });
    }

    const isInstalled = await checkCodexInstalled();
    const config = await readConfig();

    const aliases = await getModelAliases();
    const hasAliases = Object.keys(aliases || {}).some(k => 
      CODEX_ALIAS_KEYS.includes(k.toLowerCase()) && aliases[k]
    );

    return NextResponse.json({
      installed: true,
      config,
      isVirtual: !isInstalled,
      has9Router: has9RouterConfig(config) || hasAliases,
      configPath: getCodexConfigPath(),
    });
  } catch (error) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// POST - Update 9Router settings (merge with existing config)
export async function POST(request) {
  try {
    const { baseUrl, apiKey, model, subagentModel } = await request.json();
    
    if (!baseUrl || !apiKey || !model) {
      return NextResponse.json({ error: "baseUrl, apiKey and model are required" }, { status: 400 });
    }

    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch { /* No existing config */ }

    // Update only 9Router related fields (api_key goes to auth.json, not config.toml)
    parsed.model = model;
    parsed.model_provider = "9router";

    // Update or create 9router provider section (no api_key - Codex reads from auth.json)
    // Ensure /v1 suffix is added only once
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, "model_providers.9router", {
      name: "9Router",
      base_url: normalizedBaseUrl,
      wire_api: "responses",
    });

    // Add subagent configuration
    const effectiveSubagentModel = subagentModel || model;
    setNestedSection(parsed, "agents.subagent", {
      model: effectiveSubagentModel,
    });

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Update auth.json with OPENAI_API_KEY (Codex reads this first)
    const authPath = getCodexAuthPath();
    let authData = {};
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      authData = JSON.parse(existingAuth);
    } catch { /* No existing auth */ }
    
    // Force apikey mode (keep existing tokens untouched for ChatGPT login reuse)
    authData.OPENAI_API_KEY = apiKey;
    authData.auth_mode = "apikey";
    await fs.writeFile(authPath, JSON.stringify(authData, null, 2));

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
    });
  } catch (error) {
    console.log("Error updating codex settings:", error);
    return NextResponse.json({ error: "Failed to update codex settings" }, { status: 500 });
  }
}

// DELETE - Remove 9Router settings only (keep other settings)
export async function DELETE() {
  try {
    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove 9Router related root fields only if they point to 9router
    if (parsed.model_provider === "9router") {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove 9router provider section
    deleteNestedSection(parsed, "model_providers.9router");

    // Remove subagent configuration
    deleteNestedSection(parsed, "agents.subagent");

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove OPENAI_API_KEY from auth.json
    const authPath = getCodexAuthPath();
    try {
      const existingAuth = await fs.readFile(authPath, "utf-8");
      const authData = JSON.parse(existingAuth);
      delete authData.OPENAI_API_KEY;
      delete authData.auth_mode;

      // Write back or delete if empty
      if (Object.keys(authData).length === 0) {
        await fs.unlink(authPath);
      } else {
        await fs.writeFile(authPath, JSON.stringify(authData, null, 2));
      }
    } catch { /* No auth file */ }

    return NextResponse.json({
      success: true,
      message: "9Router settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}
