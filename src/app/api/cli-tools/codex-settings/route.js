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
title Codex Endpoint Switcher (9Router)
cls

echo ==================================================
echo       Codex Endpoint Switcher (9Router)
echo ==================================================
echo.
echo Select target 9Router server:
echo  [1] Local 9Router (http://localhost:20127/v1)
echo  [2] Remote 9Router   (${displayUrl})
echo  [3] Original Codex API (Default Official)
echo.
echo ==================================================
set /p choice="Enter choice (1, 2, or 3): "

if "%choice%"=="1" (
    echo Switching to Local 9Router...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\\config.toml'; if (Test-Path $p) { $c = Get-Content $p -Raw; if ($c -notlike '*model_provider = \\\"9router\\\"*') { $c += \\\"\\\`r\\\`nmodel_provider = \\\`\"9router\\\`\"\\\`r\\\`n\\\`r\\\`n[model_providers.9router]\\\`r\\\`nname = \\\`\"9Router\\\`\"\\\`r\\\`nbase_url = \\\`\"\\\`\"\\\`r\\\`nwire_api = \\\`\"responses\\\`\"\\\`r\\\`n\\\" }; $c -replace '(base_url\\s*=\\s*\\\")[^\\\"]*(\\\")', \\\"\${1}http://localhost:20127/v1\${2}\\\" | Set-Content $p; Write-Host '[SUCCESS] Codex config updated to point to Local 9Router' -ForegroundColor Green } else { Write-Host 'config.toml not found.' -ForegroundColor Red }"
    goto end
)

if "%choice%"=="2" (
    echo Switching to Remote 9Router...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\\config.toml'; if (Test-Path $p) { $c = Get-Content $p -Raw; if ($c -notlike '*model_provider = \\\"9router\\\"*') { $c += \\\"\\\`r\\\`nmodel_provider = \\\`\"9router\\\`\"\\\`r\\\`n\\\`r\\\`n[model_providers.9router]\\\`r\\\`nname = \\\`\"9Router\\\`\"\\\`r\\\`nbase_url = \\\`\"\\\`\"\\\`r\\\`nwire_api = \\\`\"responses\\\`\"\\\`r\\\`n\\\" }; $c -replace '(base_url\\s*=\\s*\\\")[^\\\"]*(\\\")', \\\"\${1}${displayUrl}\${2}\\\" | Set-Content $p; Write-Host '[SUCCESS] Codex config updated to point to Remote 9Router' -ForegroundColor Green } else { Write-Host 'config.toml not found.' -ForegroundColor Red }"
    goto end
)

if "%choice%"=="3" (
    echo Reverting to Official Codex Settings...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\\config.toml'; $a = join-path $env:USERPROFILE '.codex\\auth.json'; if (Test-Path $p) { $c = Get-Content $p -Raw; $c = $c -replace 'model_provider\\s*=\\s*\\\"9router\\\"\\s*\\r?\\n?', ''; $c = $c -replace '(?s)\\[model_providers\\.9router\\].*?(?=\\r?\\n\\[|\\Z)', ''; $c = $c -replace '(?s)\\[agents\\.subagent\\].*?(?=\\r?\\n\\[|\\Z)', ''; Set-Content $p $c.Trim(); Write-Host 'config.toml restored' -ForegroundColor Green }; if (Test-Path $a) { $j = Get-Content $a | ConvertFrom-Json; $j.psobject.properties.remove('OPENAI_API_KEY'); $j.psobject.properties.remove('auth_mode'); if (($j | Get-Member -MemberType NoteProperty).Count -eq 0) { Remove-Item $a } else { $j | ConvertTo-Json | Set-Content $a }; Write-Host 'auth.json restored' -ForegroundColor Green }"
    goto end
)

echo Invalid choice. Exiting.

:end
echo.
pause
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
