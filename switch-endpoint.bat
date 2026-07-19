@echo off
title Codex Endpoint Switcher (9Router)
cls

echo ==================================================
echo       Codex Endpoint Switcher (9Router)
echo ==================================================
echo.

:: Use PowerShell to dynamically parse BASE_URL from local .env file
for /f "delims=" %%i in ('powershell -Command "$envPath = join-path '%~dp0' '.env'; $vpsUrl = 'https://lppm.umnaw.ac.id/route9/v1'; if (Test-Path $envPath) { $line = Get-Content $envPath | Where-Object { $_ -match '^BASE_URL=' -or $_ -match '^NEXT_PUBLIC_BASE_URL=' } | Select-Object -First 1; if ($line) { $val = ($line -split '=', 2)[1].Trim().Trim(\"'\").Trim(\"\\\"\"); if ($val -and $val -notlike '*localhost*' -and $val -notlike '*127.0.0.1*') { $vpsUrl = $val; if ($vpsUrl -notlike '*/v1') { $vpsUrl = $vpsUrl.Replace(/\/+$/, '') + '/v1' } } } }; Write-Output $vpsUrl"') do set TARGET_VPS_URL=%%i

echo Select target 9Router server:
echo  [1] Local 9Router (http://localhost:20127/v1)
echo  [2] VPS 9Router   (%TARGET_VPS_URL%)
echo  [3] Original Codex API (Default Official)
echo.
echo ==================================================
set /p choice="Enter choice (1, 2, or 3): "

if "%choice%"=="1" (
    echo Switching to Local 9Router...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\config.toml'; if (Test-Path $p) { $c = Get-Content $p -Raw; if ($c -notlike '*model_provider = \"9router\"*') { $c += \"`r`nmodel_provider = `"9router`\"`r`n`r`n[model_providers.9router]`r`nname = `"9Router`\"`r`nbase_url = `"`\"`r`nwire_api = `"responses`\"`r`n\" }; $c -replace '(base_url\s*=\s*\")[^\"]*(\")', \"`${1}http://localhost:20127/v1`${2}\" | Set-Content $p; Write-Host '[SUCCESS] Codex config updated to point to Local 9Router' -ForegroundColor Green } else { Write-Host 'config.toml not found.' -ForegroundColor Red }"
    goto end
)

if "%choice%"=="2" (
    echo Switching to VPS 9Router...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\config.toml'; if (Test-Path $p) { $c = Get-Content $p -Raw; if ($c -notlike '*model_provider = \"9router\"*') { $c += \"`r`nmodel_provider = `"9router`\"`r`n`r`n[model_providers.9router]`r`nname = `"9Router`\"`r`nbase_url = `"`\"`r`nwire_api = `"responses`\"`r`n\" }; $c -replace '(base_url\s*=\s*\")', \"`${1}%TARGET_VPS_URL%`${2}\" | Set-Content $p; Write-Host '[SUCCESS] Codex config updated to point to VPS 9Router (%TARGET_VPS_URL%)' -ForegroundColor Green } else { Write-Host 'config.toml not found.' -ForegroundColor Red }"
    goto end
)

if "%choice%"=="3" (
    echo Reverting to Official Codex Settings...
    powershell -Command "$p = join-path $env:USERPROFILE '.codex\config.toml'; $a = join-path $env:USERPROFILE '.codex\auth.json'; if (Test-Path $p) { $c = Get-Content $p -Raw; $c = $c -replace 'model_provider\s*=\s*\"9router\"\s*\r?\n?', ''; $c = $c -replace '(?s)\[model_providers\.9router\].*?(?=\r?\n\[|\Z)', ''; $c = $c -replace '(?s)\[agents\.subagent\].*?(?=\r?\n\[|\Z)', ''; Set-Content $p $c.Trim(); Write-Host 'config.toml restored' -ForegroundColor Green }; if (Test-Path $a) { $j = Get-Content $a | ConvertFrom-Json; $j.psobject.properties.remove('OPENAI_API_KEY'); $j.psobject.properties.remove('auth_mode'); if (($j | Get-Member -MemberType NoteProperty).Count -eq 0) { Remove-Item $a } else { $j | ConvertTo-Json | Set-Content $a }; Write-Host 'auth.json restored' -ForegroundColor Green }"
    goto end
)

echo Invalid choice. Exiting.

:end
echo.
pause
