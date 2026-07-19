# switch-endpoint.ps1
$configPath = Join-Path $env:USERPROFILE '.codex\config.toml'
$authPath = Join-Path $env:USERPROFILE '.codex\auth.json'

if (-not (Test-Path $configPath)) {
    Write-Host "Codex config file not found at $configPath" -ForegroundColor Red
    Write-Host "Please configure Codex through the dashboard first." -ForegroundColor Yellow
    Pause
    Exit
}

# Dynamically parse BASE_URL from local .env file
$envPath = Join-Path $PSScriptRoot '.env'
$vpsUrl = 'https://lppm.umnaw.ac.id/route9/v1' # Fallback
if (Test-Path $envPath) {
    $line = Get-Content $envPath | Where-Object { $_ -match '^BASE_URL=' -or $_ -match '^NEXT_PUBLIC_BASE_URL=' } | Select-Object -First 1
    if ($line) {
        $val = ($line -split '=', 2)[1].Trim().Trim("'").Trim('"')
        if ($val -and $val -notlike '*localhost*' -and $val -notlike '*127.0.0.1*') {
            $vpsUrl = $val
            if ($vpsUrl -notlike '*/v1') { $vpsUrl = $vpsUrl.Replace(/\/+$/, '') + '/v1' }
        }
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       Codex Endpoint Switcher (9Router)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Select target 9Router server:"
Write-Host " [1] Local 9Router (http://localhost:20127/v1)"
Write-Host " [2] VPS 9Router   ($vpsUrl)"
Write-Host " [3] Original Codex API (Default Official)"
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan

$choice = Read-Host "Enter choice (1, 2, or 3)"

if ($choice -eq '1') {
    $newUrl = "http://localhost:20127/v1"
    $label = "Local 9Router"
}
elseif ($choice -eq '2') {
    $newUrl = $vpsUrl
    $label = "VPS 9Router"
}
elseif ($choice -eq '3') {
    Write-Host "Reverting to Official Codex Settings..." -ForegroundColor Yellow
    $c = Get-Content $configPath -Raw
    $c = $c -replace 'model_provider\s*=\s*"9router"\s*\r?\n?', ''
    $c = $c -replace '(?s)\[model_providers\.9router\].*?(?=\r?\n\[|\Z)', ''
    $c = $c -replace '(?s)\[agents\.subagent\].*?(?=\r?\n\[|\Z)', ''
    Set-Content $configPath $c.Trim()
    Write-Host "config.toml restored" -ForegroundColor Green
    
    if (Test-Path $authPath) {
        $j = Get-Content $authPath | ConvertFrom-Json
        $j.psobject.properties.remove('OPENAI_API_KEY')
        $j.psobject.properties.remove('auth_mode')
        if (($j | Get-Member -MemberType NoteProperty).Count -eq 0) {
            Remove-Item $authPath
        } else {
            $j | ConvertTo-Json | Set-Content $authPath
        }
        Write-Host "auth.json restored" -ForegroundColor Green
    }
    Pause
    Exit
}
else {
    Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    Pause
    Exit
}

# Update or inject 9Router config
$c = Get-Content $configPath -Raw
if ($c -notlike '*model_provider = "9router"*') {
    $c += "`r`nmodel_provider = `"9router`"`r`n`r`n[model_providers.9router]`r`nname = `"9Router`"`r`nbase_url = `"`"`r`nwire_api = `"responses`"`r`n"
}

# Replace base_url line
$c = $c -replace '(base_url\s*=\s*")[^"]*(")', "`$1$newUrl`$2"
Set-Content $configPath $c

Write-Host ""
Write-Host "[SUCCESS] Codex config updated to point to: $label ($newUrl)" -ForegroundColor Green
Write-Host ""
Pause
