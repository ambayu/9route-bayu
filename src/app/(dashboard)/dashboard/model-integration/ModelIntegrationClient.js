"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import ModelSelectModal from "@/shared/components/ModelSelectModal";
import { cn } from "@/shared/utils/cn";

const STORAGE_KEY = "9router:model-integration";

const TOOLS = {
  codex: {
    id: "codex",
    label: "Codex",
    icon: "terminal",
    configPath: "%USERPROFILE%\\.codex\\config.toml",
    defaults: [],
  },
  grok: {
    id: "grok",
    label: "Grok Build",
    icon: "psychology",
    configPath: "%USERPROFILE%\\.grok\\config.toml",
    defaults: [
      { slot: "default", label: "Model utama", model: "gpt-5.5" },
      { slot: "general-purpose", label: "General purpose", model: "gpt-5.5" },
      { slot: "explore", label: "Explore", model: "gpt-5.4" },
      { slot: "plan", label: "Plan", model: "gpt-5.4-mini" },
    ],
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    icon: "code",
    configPath: "%USERPROFILE%\\.config\\opencode\\opencode.json",
    defaults: [
      { slot: "default", label: "Model utama", model: "gpt-5.5" },
      { slot: "explorer", label: "Explorer Subagent", model: "gpt-5.4" },
    ],
  },
};

const CODEX_EXTENSION_MODELS = [
  "gpt-5.5",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.2",
];

TOOLS.codex.defaults = CODEX_EXTENSION_MODELS.map((model) => ({
  slot: model,
  label: model.toUpperCase().replaceAll("-", " "),
  model,
}));

const defaultState = {
  tool: "codex",
  baseUrl: "https://route9.nurset-studio.web.id/v1",
  apiKey: "sk_9router",
  rows: TOOLS.codex.defaults,
};

const defaultToolRows = {
  codex: TOOLS.codex.defaults,
  grok: TOOLS.grok.defaults,
  opencode: TOOLS.opencode.defaults,
};

const escapeBat = (value) => String(value ?? "")
  .replaceAll("%", "%%")
  .replaceAll("^", "^^")
  .replaceAll("&", "^&")
  .replaceAll("|", "^|")
  .replaceAll("<", "^<")
  .replaceAll(">", "^>")
  .replaceAll("(", "^(")
  .replaceAll(")", "^)");

function getRowsForTool(tool, currentRows) {
  const safeCurrentRows = Array.isArray(currentRows) ? currentRows : [];
  const toolDef = TOOLS[tool];
  if (!toolDef) return [];
  const defaults = toolDef.defaults || [];
  const rows = defaults.map((row) => ({
    ...row,
    model: safeCurrentRows.find((item) => item && item.slot === row.slot)?.model ?? row.model,
  }));
  if (tool === "grok" || tool === "opencode") {
    rows.push(...safeCurrentRows.filter((row) => row && row.custom && !rows.some((item) => item.slot === row.slot)));
  }
  return rows;
}

function normalizeSavedConfig(savedConfig) {
  if (!savedConfig || typeof savedConfig !== "object") {
    return {
      config: defaultState,
      toolRows: defaultToolRows,
      newGrokName: "",
      newGrokModel: "",
      newOpenCodeName: "",
      newOpenCodeModel: "",
    };
  }
  const tool = savedConfig.tool === "grok" ? "grok" : savedConfig.tool === "opencode" ? "opencode" : "codex";
  const tools = savedConfig.tools && typeof savedConfig.tools === "object" ? savedConfig.tools : {};
  const codexRows = getRowsForTool("codex", tools.codex?.rows || (tool === "codex" ? savedConfig.rows : []));
  const grokRows = getRowsForTool("grok", tools.grok?.rows || (tool === "grok" ? savedConfig.rows : []));
  const opencodeRows = getRowsForTool("opencode", tools.opencode?.rows || (tool === "opencode" ? savedConfig.rows : []));
  const toolRows = { codex: codexRows, grok: grokRows, opencode: opencodeRows };
  return {
    config: {
      ...defaultState,
      ...savedConfig,
      tool,
      rows: toolRows[tool] || defaultToolRows[tool] || [],
    },
    toolRows,
    newGrokName: tools.grok?.newGrokName || savedConfig.newGrokName || "",
    newGrokModel: tools.grok?.newGrokModel || savedConfig.newGrokModel || "",
    newOpenCodeName: tools.opencode?.newOpenCodeName || savedConfig.newOpenCodeName || "",
    newOpenCodeModel: tools.opencode?.newOpenCodeModel || savedConfig.newOpenCodeModel || "",
  };
}

function mergeSavedConfig(serverConfig, localConfig) {
  if (!serverConfig && !localConfig) return null;
  const base = serverConfig || localConfig || {};
  const merged = {
    ...base,
    tools: {
      ...(serverConfig?.tools || localConfig?.tools || {}),
    },
  };

  for (const tool of Object.keys(TOOLS)) {
    const serverRows = serverConfig?.tools?.[tool]?.rows || (serverConfig?.tool === tool ? serverConfig?.rows : null);
    const localRows = localConfig?.tools?.[tool]?.rows || (localConfig?.tool === tool ? localConfig?.rows : null);
    merged.tools[tool] = {
      ...(serverConfig?.tools?.[tool] || localConfig?.tools?.[tool] || {}),
      ...(tool === "grok"
        ? {
            newGrokName: serverConfig?.tools?.grok?.newGrokName || localConfig?.tools?.grok?.newGrokName || localConfig?.newGrokName || "",
            newGrokModel: serverConfig?.tools?.grok?.newGrokModel || localConfig?.tools?.grok?.newGrokModel || localConfig?.newGrokModel || "",
          }
        : tool === "opencode"
        ? {
            newOpenCodeName: serverConfig?.tools?.opencode?.newOpenCodeName || localConfig?.tools?.opencode?.newOpenCodeName || localConfig?.newOpenCodeName || "",
            newOpenCodeModel: serverConfig?.tools?.opencode?.newOpenCodeModel || localConfig?.tools?.opencode?.newOpenCodeModel || localConfig?.newOpenCodeModel || "",
          }
        : {}),
      rows: Array.isArray(serverRows) ? serverRows : Array.isArray(localRows) ? localRows : [],
    };
  }

  return merged;
}

function buildCodexToml({ baseUrl = "", rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const mainModel = safeRows.find((row) => row && row.slot === "gpt-5.5")?.model || "gemini-3.6";
  const normalizedBaseUrl = baseUrl === "__9ROUTER_BASE_URL__"
    ? baseUrl
    : baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  return [
    `model = ${JSON.stringify(mainModel)}`,
    `model_provider = "9router"`,
    "",
    `[model_providers.9router]`,
    `name = "9Router"`,
    `base_url = ${JSON.stringify(normalizedBaseUrl)}`,
    `wire_api = "responses"`,
    `env_key = "OPENAI_API_KEY"`,
    "",
    `[agents.subagent]`,
    `model = ${JSON.stringify(mainModel)}`,
    "",
    `# 9Router Codex model mapping`,
    `# File lengkap mapping juga dibuat di 9router-model-map.json oleh script .bat.`,
    ...safeRows.flatMap((row) => [
      `[profiles.${JSON.stringify(row.slot)}]`,
      `model = ${JSON.stringify(row.model)}`,
      `model_provider = "9router"`,
      "",
    ]),
    "",
  ].join("\n");
}

function buildGrokToml({ baseUrl = "", apiKey = "", rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const mainModel = safeRows.find((row) => row && row.slot === "default")?.model?.trim();
  const subRows = safeRows.filter((row) => row && row.slot !== "default" && row.model?.trim());
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

function buildOpenCodeJson({ baseUrl = "", apiKey = "", rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalizedBaseUrl = baseUrl === "__9ROUTER_BASE_URL__"
    ? baseUrl
    : baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const defaultRow = safeRows.find((r) => r && r.slot === "default") || safeRows[0];
  const mainModel = defaultRow?.model?.trim() || "gpt-5.5";
  const explorerRow = safeRows.find((r) => r && r.slot === "explorer") || safeRows[1] || defaultRow;
  const explorerModel = explorerRow?.model?.trim() || mainModel;

  const modelsMap = {};
  for (const r of safeRows) {
    const m = r?.model?.trim();
    if (m) {
      modelsMap[m] = {
        name: m,
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

function buildGrokSyncPs1() {
  return [
    `$DashboardUrl = "__9ROUTER_DASHBOARD_URL__".TrimEnd("/")`,
    `$BaseUrl = "__9ROUTER_BASE_URL__"`,
    `$ApiKey = "__9ROUTER_API_KEY__"`,
    `$ConfigDir = Join-Path $env:USERPROFILE ".grok"`,
    `$ConfigPath = Join-Path $ConfigDir "config.toml"`,
    `$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)`,
    `while ($true) {`,
    `  try {`,
    `    $EncodedBaseUrl = [System.Uri]::EscapeDataString($BaseUrl)`,
    `    $Uri = "$DashboardUrl/api/v1/model-integration/grok.toml?baseUrl=$EncodedBaseUrl"`,
    `    $Toml = (Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20 -Headers @{ Accept = "text/plain"; Authorization = "Bearer $ApiKey" }).Content`,
    `    if ($Toml -and $Toml.Trim().Length -gt 0) {`,
    `      [System.IO.Directory]::CreateDirectory($ConfigDir) | Out-Null`,
    `      [System.IO.File]::WriteAllText($ConfigPath, $Toml, $Utf8NoBom)`,
    `    }`,
    `  } catch {}`,
    `  Start-Sleep -Seconds 20`,
    `}`,
    "",
  ].join("\n");
}

function writeBatchFileBlock(targetVar, content) {
  return [
    `> "%${targetVar}%" (`,
    ...(content || "").split("\n").map((line) => {
      if (!line) return "  echo.";
      return `  echo ${escapeBat(line)
        .replaceAll("%%BASE_URL%%", "%BASE_URL%")
        .replaceAll("%%DASHBOARD_URL%%", "%DASHBOARD_URL%")}`;
    }),
    ")",
  ];
}

function buildPlainBat(lines) {
  return [
    "@echo off",
    "setlocal",
    "chcp 65001 >nul",
    ...lines,
    "echo.",
    "pause",
  ].join("\r\n");
}

function buildBat(config) {
  if (!config || typeof config !== "object") return "";
  const toolId = config.tool && TOOLS[config.tool] ? config.tool : "codex";
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const safeConfig = { ...config, tool: toolId, rows };

  const toml = toolId === "codex"
    ? buildCodexToml({ ...safeConfig, baseUrl: "__9ROUTER_BASE_URL__" })
    : buildGrokToml({ ...safeConfig, baseUrl: "__9ROUTER_BASE_URL__" });
  const opencodeJson = buildOpenCodeJson({ ...safeConfig, baseUrl: "__9ROUTER_BASE_URL__" });
  const codexMapJson = JSON.stringify(
    Object.fromEntries(rows.map((row) => [row?.slot || "", row?.model || ""])),
    null,
    2,
  );
  const authJson = JSON.stringify({ OPENAI_API_KEY: config.apiKey || "sk_9router", auth_mode: "apikey" }, null, 2);
  const apiKey = config.apiKey || "sk_9router";

  if (toolId === "codex") {
    return buildPlainBat([
      "set \"CONFIG_DIR=%USERPROFILE%\\.codex\"",
      "set \"CONFIG_PATH=%CONFIG_DIR%\\config.toml\"",
      "set \"AUTH_PATH=%CONFIG_DIR%\\auth.json\"",
      "set \"MAP_PATH=%CONFIG_DIR%\\9router-model-map.json\"",
      "if not exist \"%CONFIG_DIR%\" mkdir \"%CONFIG_DIR%\"",
      "echo Pilih endpoint Codex:",
      "echo 1. 9Router local       http://127.0.0.1:20128/v1",
      "echo 2. 9Router cloud       https://route9.nurset-studio.web.id/v1",
      "echo 3. Config bawaan Codex",
      "set /p CHOICE=Pilihan (1/2/3): ",
      "if \"%CHOICE%\"==\"3\" goto codex_default",
      "if \"%CHOICE%\"==\"1\" (set \"BASE_URL=http://127.0.0.1:20128/v1\") else (set \"BASE_URL=https://route9.nurset-studio.web.id/v1\")",
      ...writeBatchFileBlock("CONFIG_PATH", toml.replaceAll("__9ROUTER_BASE_URL__", "%BASE_URL%")),
      ...writeBatchFileBlock("AUTH_PATH", authJson),
      ...writeBatchFileBlock("MAP_PATH", codexMapJson),
      `setx OPENAI_API_KEY "${escapeBat(apiKey)}" >nul`,
      "echo Codex config updated at %CONFIG_PATH%",
      "echo OPENAI_API_KEY set for current user.",
      "echo Restart VS Code/Codex/terminal lama supaya environment baru kebaca.",
      "goto done",
      ":codex_default",
      "if exist \"%CONFIG_PATH%\" copy /Y \"%CONFIG_PATH%\" \"%CONFIG_PATH%.bak\" >nul",
      "if exist \"%CONFIG_PATH%\" del /F /Q \"%CONFIG_PATH%\"",
      "if exist \"%MAP_PATH%\" del /F /Q \"%MAP_PATH%\"",
      "echo Codex dikembalikan ke config bawaan. Auth Codex yang sudah ada tidak dihapus.",
      ":done",
    ]);
  }

function buildOpenCodeSyncPs1() {
  return [
    `$DashboardUrl = "__9ROUTER_DASHBOARD_URL__".TrimEnd("/")`,
    `$BaseUrl = "__9ROUTER_BASE_URL__"`,
    `$ApiKey = "__9ROUTER_API_KEY__"`,
    `$ConfigDir = Join-Path $env:USERPROFILE ".config\\opencode"`,
    `$ConfigPath = Join-Path $ConfigDir "opencode.json"`,
    `$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)`,
    `while ($true) {`,
    `  try {`,
    `    $EncodedBaseUrl = [System.Uri]::EscapeDataString($BaseUrl)`,
    `    $Uri = "$DashboardUrl/api/v1/model-integration/opencode.json?baseUrl=$EncodedBaseUrl"`,
    `    $Json = (Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20 -Headers @{ Accept = "application/json"; Authorization = "Bearer $ApiKey" }).Content`,
    `    if ($Json -and $Json.Trim().Length -gt 0) {`,
    `      [System.IO.Directory]::CreateDirectory($ConfigDir) | Out-Null`,
    `      [System.IO.File]::WriteAllText($ConfigPath, $Json, $Utf8NoBom)`,
    `    }`,
    `  } catch {}`,
    `  Start-Sleep -Seconds 20`,
    `}`,
    "",
  ].join("\n");
}

function buildOpenCodeFetchCommand() {
  return [
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command",
    "\"$ErrorActionPreference='Stop';",
    "$ConfigPath=$env:CONFIG_PATH;",
    "$BaseUrl=$env:BASE_URL;",
    "$DashboardUrl=$env:DASHBOARD_URL.TrimEnd('/');",
    "$EncodedBaseUrl=[System.Uri]::EscapeDataString($BaseUrl);",
    "$Uri=\\\"$DashboardUrl/api/v1/model-integration/opencode.json?baseUrl=$EncodedBaseUrl\\\";",
    "$Json=(Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20 -Headers @{ Accept='application/json' }).Content;",
    "[System.IO.Directory]::CreateDirectory((Split-Path $ConfigPath)) | Out-Null;",
    "[System.IO.File]::WriteAllText($ConfigPath,$Json,[System.Text.UTF8Encoding]::new($false))\"",
  ].join(" ");
}

  if (toolId === "opencode") {
    return buildPlainBat([
      "set \"CONFIG_DIR=%USERPROFILE%\\.config\\opencode\"",
      "set \"CONFIG_PATH=%CONFIG_DIR%\\opencode.json\"",
      "set \"SYNC_PATH=%CONFIG_DIR%\\9router-opencode-sync.ps1\"",
      "set \"STARTUP_PATH=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\9router-opencode-model-sync.cmd\"",
      "if not exist \"%CONFIG_DIR%\" mkdir \"%CONFIG_DIR%\"",
      "echo Pilih endpoint OpenCode:",
      "echo 1. 9Router local       http://127.0.0.1:20128/v1",
      "echo 2. 9Router cloud       https://route9.nurset-studio.web.id/v1",
      "echo 3. Config bawaan OpenCode",
      "set /p CHOICE=Pilihan (1/2/3): ",
      "if \"%CHOICE%\"==\"3\" goto opencode_default",
      "if \"%CHOICE%\"==\"1\" (",
      "  set \"BASE_URL=http://127.0.0.1:20128/v1\"",
      "  set \"DASHBOARD_URL=http://127.0.0.1:20128\"",
      ") else (",
      "  set \"BASE_URL=https://route9.nurset-studio.web.id/v1\"",
      "  set \"DASHBOARD_URL=https://route9.nurset-studio.web.id\"",
      ")",
      buildOpenCodeFetchCommand(),
      ...writeBatchFileBlock("SYNC_PATH", buildOpenCodeSyncPs1()
        .replaceAll("__9ROUTER_BASE_URL__", "%BASE_URL%")
        .replaceAll("__9ROUTER_DASHBOARD_URL__", "%DASHBOARD_URL%")
        .replaceAll("__9ROUTER_API_KEY__", apiKey)),
      ...writeBatchFileBlock("STARTUP_PATH", "@echo off\nstart \"\" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SYNC_PATH%\"\n"),
      "start \"\" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SYNC_PATH%\"",
      `setx OPENAI_API_KEY "${escapeBat(apiKey)}" >nul`,
      "echo OpenCode config updated at %CONFIG_PATH%",
      "echo Auto-sync aktif. Setelah Simpan di dashboard, ~/.config/opencode/opencode.json akan ikut update otomatis.",
      "goto done",
      ":opencode_default",
      "if exist \"%STARTUP_PATH%\" del /F /Q \"%STARTUP_PATH%\"",
      "if exist \"%SYNC_PATH%\" del /F /Q \"%SYNC_PATH%\"",
      "if exist \"%CONFIG_PATH%\" copy /Y \"%CONFIG_PATH%\" \"%CONFIG_PATH%.bak\" >nul",
      "if exist \"%CONFIG_PATH%\" del /F /Q \"%CONFIG_PATH%\"",
      "echo OpenCode dikembalikan ke config bawaan.",
      ":done",
    ]);
  }

  return buildPlainBat([
    "set \"CONFIG_DIR=%USERPROFILE%\\.grok\"",
    "set \"CONFIG_PATH=%CONFIG_DIR%\\config.toml\"",
    "set \"SYNC_PATH=%CONFIG_DIR%\\9router-grok-sync.ps1\"",
    "set \"STARTUP_PATH=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\9router-grok-model-sync.cmd\"",
    "if not exist \"%CONFIG_DIR%\" mkdir \"%CONFIG_DIR%\"",
    "echo Pilih endpoint Grok Build:",
    "echo 1. 9Router local       http://127.0.0.1:20128/v1",
    "echo 2. 9Router cloud       https://route9.nurset-studio.web.id/v1",
    "echo 3. Config bawaan Grok  grok-build",
    "set /p CHOICE=Pilihan (1/2/3): ",
    "if \"%CHOICE%\"==\"3\" goto grok_default",
    "if \"%CHOICE%\"==\"1\" (",
    "  set \"BASE_URL=http://127.0.0.1:20128/v1\"",
    "  set \"DASHBOARD_URL=http://127.0.0.1:20128\"",
    ") else (",
    "  set \"BASE_URL=https://route9.nurset-studio.web.id/v1\"",
    "  set \"DASHBOARD_URL=https://route9.nurset-studio.web.id\"",
    ")",
    ...writeBatchFileBlock("CONFIG_PATH", toml.replaceAll("__9ROUTER_BASE_URL__", "%BASE_URL%")),
    ...writeBatchFileBlock("SYNC_PATH", buildGrokSyncPs1()
      .replaceAll("__9ROUTER_BASE_URL__", "%BASE_URL%")
      .replaceAll("__9ROUTER_DASHBOARD_URL__", "%DASHBOARD_URL%")
      .replaceAll("__9ROUTER_API_KEY__", apiKey)),
    ...writeBatchFileBlock("STARTUP_PATH", "@echo off\nstart \"\" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SYNC_PATH%\"\n"),
    "start \"\" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%SYNC_PATH%\"",
    "echo Grok Build config updated at %CONFIG_PATH%",
    "echo Auto-sync aktif. Setelah Simpan di dashboard, ~/.grok/config.toml akan ikut update otomatis.",
    "goto done",
    ":grok_default",
    ...writeBatchFileBlock("CONFIG_PATH", "[models]\ndefault = \"grok-build\"\n"),
    "if exist \"%STARTUP_PATH%\" del /F /Q \"%STARTUP_PATH%\"",
    "if exist \"%SYNC_PATH%\" del /F /Q \"%SYNC_PATH%\"",
    "echo Grok Build dikembalikan ke config bawaan.",
    ":done",
  ]);
}

export default function ModelIntegrationClient() {
  const [config, setConfig] = useState(defaultState);
  const [toolRows, setToolRows] = useState(defaultToolRows);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeProviders, setActiveProviders] = useState([]);
  const [modelAliases, setModelAliases] = useState({});
  const [selectingSlot, setSelectingSlot] = useState(null);
  const [newGrokName, setNewGrokName] = useState("");
  const [newGrokModel, setNewGrokModel] = useState("");
  const [newOpenCodeName, setNewOpenCodeName] = useState("");
  const [newOpenCodeModel, setNewOpenCodeModel] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadSavedConfig = async () => {
      let localConfig = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) localConfig = JSON.parse(raw);
      } catch {
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      }

      try {
        const response = await fetch("/api/model-integration", { cache: "no-store" });
        const data = response.ok ? await response.json() : {};
        const savedConfig = mergeSavedConfig(data?.config, localConfig);
        const normalized = normalizeSavedConfig(savedConfig || localConfig || defaultState);
        if (!mounted) return;
        setConfig(normalized.config);
        setToolRows(normalized.toolRows);
        setNewGrokName(normalized.newGrokName);
        setNewGrokModel(normalized.newGrokModel);
        setNewOpenCodeName(normalized.newOpenCodeName);
        setNewOpenCodeModel(normalized.newOpenCodeModel);

        if (localConfig && (!data?.config || !data?.config?.tools)) {
          fetch("/api/model-integration", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: normalized.config }),
          }).catch(() => {});
        }
      } catch (error) {
        console.warn("Unable to load model-integration config:", error);
        if (!mounted) return;
        const normalized = normalizeSavedConfig(localConfig || defaultState);
        setConfig(normalized.config);
        setToolRows(normalized.toolRows);
        setNewGrokName(normalized.newGrokName);
        setNewGrokModel(normalized.newGrokModel);
        setNewOpenCodeName(normalized.newOpenCodeName);
        setNewOpenCodeModel(normalized.newOpenCodeModel);
      }
    };
    loadSavedConfig();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch("/api/providers").then((res) => res.ok ? res.json() : { connections: [] }),
      fetch("/api/models/alias").then((res) => res.ok ? res.json() : { aliases: {} }),
    ])
      .then(([providersData, aliasesData]) => {
        if (!mounted) return;
        setActiveProviders((providersData?.connections || []).filter((connection) => connection && connection.isActive !== false));
        setModelAliases(aliasesData?.aliases || aliasesData || {});
      })
      .catch(() => {
        if (!mounted) return;
        setActiveProviders([]);
        setModelAliases({});
      });
    return () => { mounted = false; };
  }, []);

  const script = useMemo(() => buildBat(config), [config]);

  const updateTool = (toolId) => {
    setSaved(false);
    const validTool = TOOLS[toolId] ? toolId : "codex";
    const currentToolRows = getRowsForTool(config.tool, config.rows);
    const updatedToolRows = {
      ...toolRows,
      [config.tool]: currentToolRows,
    };
    const nextRows = getRowsForTool(validTool, updatedToolRows[validTool] || []);
    setToolRows(updatedToolRows);
    setConfig((current) => ({
      ...current,
      tool: validTool,
      rows: nextRows,
    }));
  };

  const updateRow = (slot, model) => {
    setSaved(false);
    const updatedRows = (config.rows || []).map((row) => row.slot === slot ? { ...row, model } : row);
    setConfig((current) => ({
      ...current,
      rows: updatedRows,
    }));
    setToolRows((current) => ({
      ...current,
      [config.tool]: getRowsForTool(config.tool, updatedRows),
    }));
  };

  const handleSelectModel = (model) => {
    const value = typeof model === "string" ? model : model?.value || model?.id;
    if (!selectingSlot || !value) return;
    if (selectingSlot === "__new_grok__") {
      setNewGrokModel(value);
      setSelectingSlot(null);
      return;
    }
    if (selectingSlot === "__new_opencode__") {
      setNewOpenCodeModel(value);
      setSelectingSlot(null);
      return;
    }
    updateRow(selectingSlot, value);
    setSelectingSlot(null);
  };

  const addGrokModel = () => {
    const name = newGrokName.trim();
    if (!name || !newGrokModel) return;
    const slot = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slot) return;
    setSaved(false);
    const existing = config.rows || [];
    const updatedRows = existing.some((row) => row.slot === slot)
      ? existing.map((row) => row.slot === slot ? { ...row, label: name, model: newGrokModel, custom: true } : row)
      : [...existing, { slot, label: name, model: newGrokModel, custom: true }];
    setConfig((current) => ({ ...current, rows: updatedRows }));
    setToolRows((current) => ({ ...current, grok: updatedRows }));
    setNewGrokName("");
    setNewGrokModel("");
  };

  const removeGrokModel = (slot) => {
    setSaved(false);
    const updatedRows = (config.rows || []).filter((row) => row.slot !== slot);
    setConfig((current) => ({ ...current, rows: updatedRows }));
    setToolRows((current) => ({ ...current, grok: updatedRows }));
  };

  const addOpenCodeModel = () => {
    const name = newOpenCodeName.trim();
    if (!name || !newOpenCodeModel) return;
    const slot = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slot) return;
    setSaved(false);
    const existing = config.rows || [];
    const updatedRows = existing.some((row) => row.slot === slot)
      ? existing.map((row) => row.slot === slot ? { ...row, label: name, model: newOpenCodeModel, custom: true } : row)
      : [...existing, { slot, label: name, model: newOpenCodeModel, custom: true }];
    setConfig((current) => ({ ...current, rows: updatedRows }));
    setToolRows((current) => ({ ...current, opencode: updatedRows }));
    setNewOpenCodeName("");
    setNewOpenCodeModel("");
  };

  const removeOpenCodeModel = (slot) => {
    setSaved(false);
    const updatedRows = (config.rows || []).filter((row) => row.slot !== slot);
    setConfig((current) => ({ ...current, rows: updatedRows }));
    setToolRows((current) => ({ ...current, opencode: updatedRows }));
  };

  const saveConfig = async () => {
    const currentToolRows = getRowsForTool(config.tool, config.rows);
    const nextToolRows = {
      ...toolRows,
      [config.tool]: currentToolRows,
    };
    setToolRows(nextToolRows);
    const payload = {
      ...config,
      rows: nextToolRows[config.tool],
      tools: {
        codex: { rows: nextToolRows.codex },
        grok: { rows: nextToolRows.grok, newGrokName, newGrokModel },
        opencode: { rows: nextToolRows.opencode, newOpenCodeName, newOpenCodeModel },
      },
      newGrokName,
      newGrokModel,
      newOpenCodeName,
      newOpenCodeModel,
    };
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/model-integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload }),
      });
      if (!response.ok) throw new Error("Save failed");
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
      setSaved(true);
      return true;
    } catch {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
      setSaveError("Tersimpan di browser, gagal simpan ke database.");
      setSaved(false);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const downloadScript = async () => {
    await saveConfig();
    const blob = new Blob([script], { type: "application/bat;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `9router-${config.tool}-model-config.bat`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const safeRows = Array.isArray(config.rows) ? config.rows : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 sm:px-4 lg:px-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-text-main">Integrasi model</h1>
        <p className="text-sm text-text-muted">Pilih model yang muncul di ekstensi, lalu arahkan ke model 9Router yang ingin dipakai.</p>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          {Object.values(TOOLS).map((tool) => (
            <button
              key={tool.id}
              onClick={() => updateTool(tool.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all",
                config.tool === tool.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface hover:bg-surface-2 text-text-main",
              )}
            >
              <span className="material-symbols-outlined text-[20px]">{tool.icon}</span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{tool.label}</span>
                <span className="text-xs text-text-muted">{tool.configPath}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-surface p-4">
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Input
              label="Base URL"
              value={config.baseUrl || ""}
              onChange={(event) => { setSaved(false); setConfig((current) => ({ ...current, baseUrl: event.target.value })); }}
            />
            <Input
              label="API Key"
              value={config.apiKey || ""}
              onChange={(event) => { setSaved(false); setConfig((current) => ({ ...current, apiKey: event.target.value })); }}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {config.tool === "codex" && (
              <div className="grid grid-cols-[1fr_1fr] gap-2 border-b border-border pb-2 text-xs font-semibold uppercase text-text-muted">
                <span>Model di ekstensi Codex</span>
                <span>Dipakai sebagai model</span>
              </div>
            )}
            {safeRows.map((row) => (
              <div key={row.slot} className="grid min-w-0 gap-2 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-main">{row.label}</p>
                  <p className="text-xs text-text-muted">{config.tool === "codex" ? "codex extension model" : row.slot}</p>
                </div>
                {config.tool === "codex" ? (
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={row.model || ""}
                      onChange={(event) => updateRow(row.slot, event.target.value)}
                      placeholder="provider/model-id"
                      className="h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-text-main focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <Button className="whitespace-nowrap" variant="secondary" onClick={() => setSelectingSlot(row.slot)}>Select Model</Button>
                  </div>
                ) : row.custom ? (
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <input
                      value={row.model || ""}
                      onChange={(event) => updateRow(row.slot, event.target.value)}
                      placeholder="provider/model-id"
                      className="h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-text-main focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <Button className="whitespace-nowrap" variant="secondary" onClick={() => setSelectingSlot(row.slot)}>Select Model</Button>
                    <Button variant="ghost" icon="delete" onClick={() => (config.tool === "opencode" ? removeOpenCodeModel(row.slot) : removeGrokModel(row.slot))} />
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      value={row.model || ""}
                      onChange={(event) => updateRow(row.slot, event.target.value)}
                      placeholder="provider/model-id"
                      className="h-10 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-sm text-text-main focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <Button className="whitespace-nowrap" variant="secondary" onClick={() => setSelectingSlot(row.slot)}>Select Model</Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {config.tool === "grok" && (
            <div className="mt-5 rounded-lg border border-dashed border-border p-3">
              <div className="grid min-w-0 gap-2 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-end">
                <Input
                  label="Nama model Grok"
                  placeholder="contoh: GPT-5.5"
                  value={newGrokName}
                  onChange={(event) => { setSaved(false); setNewGrokName(event.target.value); }}
                />
                <Input
                  label="Model 9Router"
                  placeholder="provider/model-id"
                  value={newGrokModel}
                  onChange={(event) => { setSaved(false); setNewGrokModel(event.target.value); }}
                />
                <div className="flex gap-2">
                  <Button className="whitespace-nowrap" variant="secondary" onClick={() => setSelectingSlot("__new_grok__")}>Select Model</Button>
                  <Button icon="add" onClick={addGrokModel} disabled={!newGrokName.trim() || !newGrokModel}>Add</Button>
                </div>
              </div>
            </div>
          )}

          {config.tool === "opencode" && (
            <div className="mt-5 rounded-lg border border-dashed border-border p-3">
              <div className="grid min-w-0 gap-2 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-end">
                <Input
                  label="Nama model OpenCode"
                  placeholder="contoh: Claude 3.7 Sonnet"
                  value={newOpenCodeName}
                  onChange={(event) => { setSaved(false); setNewOpenCodeName(event.target.value); }}
                />
                <Input
                  label="Model 9Router"
                  placeholder="provider/model-id"
                  value={newOpenCodeModel}
                  onChange={(event) => { setSaved(false); setNewOpenCodeModel(event.target.value); }}
                />
                <div className="flex gap-2">
                  <Button className="whitespace-nowrap" variant="secondary" onClick={() => setSelectingSlot("__new_opencode__")}>Select Model</Button>
                  <Button icon="add" onClick={addOpenCodeModel} disabled={!newOpenCodeName.trim() || !newOpenCodeModel}>Add</Button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button icon="save" variant="secondary" onClick={saveConfig} loading={saving}>Simpan</Button>
            <Button icon="download" onClick={downloadScript}>Download .bat</Button>
            {saved && <span className="inline-flex items-center text-sm text-green-600">Tersimpan di database</span>}
            {saveError && <span className="inline-flex items-center text-sm text-red-600">{saveError}</span>}
          </div>

          <pre className="mt-5 max-h-72 max-w-full overflow-auto whitespace-pre rounded-lg bg-surface-2 p-3 text-xs text-text-muted">
            {script}
          </pre>
        </div>
      </div>

      <ModelSelectModal
        isOpen={Boolean(selectingSlot)}
        onClose={() => setSelectingSlot(null)}
        onSelect={handleSelectModel}
        selectedModel={
          selectingSlot === "__new_grok__"
            ? newGrokModel
            : selectingSlot === "__new_opencode__"
            ? newOpenCodeModel
            : safeRows.find((row) => row.slot === selectingSlot)?.model
        }
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        title="Select Model"
      />
    </div>
  );
}
