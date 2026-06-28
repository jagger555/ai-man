[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$LiveTalkingPath = "D:\Projects\DH",
    [int]$LiveTalkingPort = 8010,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [string]$LiveTalkingModel = "wav2lip",
    [string]$LiveTalkingAvatarId = "626",
    [int]$LiveTalkingMaxSession = 2,
    [switch]$SkipLiveTalking,
    [switch]$NoBrowser,
    [switch]$VisibleWindows,
    [switch]$InstallDependencies,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Quote-PS {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Test-TcpPortOpen {
    param(
        [string]$HostName,
        [int]$Port
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne(250)) {
            return $false
        }
        $client.EndConnect($connect)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command
    )

    $inner = @(
        "`$ErrorActionPreference = 'Continue'"
        "Set-Location -LiteralPath $(Quote-PS $WorkingDirectory)"
        $Command
    ) -join [Environment]::NewLine

    if ($DryRun) {
        Write-Host "[$Name] $Command"
        return $null
    }

    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass")
    if ($VisibleWindows) {
        $arguments += "-NoExit"
    }
    $arguments += @("-Command", $inner)

    $windowStyle = "Hidden"
    if ($VisibleWindows) {
        $windowStyle = "Normal"
    }

    return Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle $windowStyle -PassThru
}

function Require-Path {
    param(
        [string]$Name,
        [string]$Path
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Name not found: $Path"
    }
}

function Resolve-LiveTalkingPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "LiveTalking path is empty"
    }

    $resolvedPath = (Resolve-Path $Path).Path
    $directApp = Join-Path $resolvedPath "app.py"
    if (Test-Path -LiteralPath $directApp) {
        return $resolvedPath
    }

    $nestedPath = Join-Path $resolvedPath "LiveTalking"
    $nestedApp = Join-Path $nestedPath "app.py"
    if (Test-Path -LiteralPath $nestedApp) {
        return (Resolve-Path $nestedPath).Path
    }

    throw "LiveTalking app.py not found under: $Path"
}

$ScriptRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ScriptRoot)) {
    $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Join-Path $ScriptRoot ".."
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$BackendPath = Join-Path $ProjectRoot "backend"
$FrontendPath = Join-Path $ProjectRoot "frontend"
$RunDir = Join-Path $env:TEMP "ai-man-local-run"
$LogDir = Join-Path $RunDir "logs"
$PidFile = Join-Path $RunDir "pids.json"

Require-Path "Project root" $ProjectRoot
Require-Path "Backend path" $BackendPath
Require-Path "Frontend path" $FrontendPath

if (-not $SkipLiveTalking) {
    Require-Path "LiveTalking path" $LiveTalkingPath
    $LiveTalkingPath = Resolve-LiveTalkingPath $LiveTalkingPath
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if ($InstallDependencies) {
    Write-Host "Installing backend dependencies..."
    Push-Location $BackendPath
    try {
        python -m pip install -r requirements.txt
    }
    finally {
        Pop-Location
    }

    Write-Host "Installing frontend dependencies..."
    Push-Location $FrontendPath
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}
elseif (-not (Test-Path -LiteralPath (Join-Path $FrontendPath "node_modules"))) {
    Write-Warning "frontend\node_modules not found. Run with -InstallDependencies once if npm packages are missing."
}

$services = @()
$digitalHumanBaseUrl = "http://127.0.0.1:$LiveTalkingPort"

if (-not $SkipLiveTalking) {
    if (Test-TcpPortOpen "127.0.0.1" $LiveTalkingPort) {
        Write-Host "LiveTalking port $LiveTalkingPort is already open. Reusing it."
        $services += [pscustomobject]@{
            name = "livetalking"
            pid = $null
            port = $LiveTalkingPort
            log = $null
            reused = $true
        }
    }
    else {
        $liveLog = Join-Path $LogDir "livetalking.log"
        $liveCommand = "python app.py --transport webrtc --model $(Quote-PS $LiveTalkingModel) --avatar_id $(Quote-PS $LiveTalkingAvatarId) --listenport $LiveTalkingPort --max_session $LiveTalkingMaxSession 2>&1 | Tee-Object -FilePath $(Quote-PS $liveLog) -Append"
        $liveProcess = Start-ManagedProcess -Name "livetalking" -WorkingDirectory $LiveTalkingPath -Command $liveCommand
        $services += [pscustomobject]@{
            name = "livetalking"
            pid = if ($liveProcess) { $liveProcess.Id } else { $null }
            port = $LiveTalkingPort
            log = $liveLog
            reused = $false
        }
    }
}

if (Test-TcpPortOpen "127.0.0.1" $BackendPort) {
    Write-Host "Backend port $BackendPort is already open. Reusing it."
    $services += [pscustomobject]@{
        name = "backend"
        pid = $null
        port = $BackendPort
        log = $null
        reused = $true
    }
}
else {
    $backendLog = Join-Path $LogDir "backend.log"
    $backendCommand = "`$env:DIGITAL_HUMAN_BASE_URL = $(Quote-PS $digitalHumanBaseUrl); `$env:DIGITAL_HUMAN_AVATAR = $(Quote-PS $LiveTalkingAvatarId); python -m uvicorn app.main:app --reload --host 127.0.0.1 --port $BackendPort 2>&1 | Tee-Object -FilePath $(Quote-PS $backendLog) -Append"
    $backendProcess = Start-ManagedProcess -Name "backend" -WorkingDirectory $BackendPath -Command $backendCommand
    $services += [pscustomobject]@{
        name = "backend"
        pid = if ($backendProcess) { $backendProcess.Id } else { $null }
        port = $BackendPort
        log = $backendLog
        reused = $false
    }
}

if (Test-TcpPortOpen "127.0.0.1" $FrontendPort) {
    Write-Host "Frontend port $FrontendPort is already open. Reusing it."
    $services += [pscustomobject]@{
        name = "frontend"
        pid = $null
        port = $FrontendPort
        log = $null
        reused = $true
    }
}
else {
    $frontendLog = Join-Path $LogDir "frontend.log"
    $frontendCommand = "npm run dev -- --host 127.0.0.1 --port $FrontendPort 2>&1 | Tee-Object -FilePath $(Quote-PS $frontendLog) -Append"
    $frontendProcess = Start-ManagedProcess -Name "frontend" -WorkingDirectory $FrontendPath -Command $frontendCommand
    $services += [pscustomObject]@{
        name = "frontend"
        pid = if ($frontendProcess) { $frontendProcess.Id } else { $null }
        port = $FrontendPort
        log = $frontendLog
        reused = $false
    }
}

if (-not $DryRun) {
    $services | ConvertTo-Json -Depth 4 | Set-Content -Path $PidFile -Encoding UTF8
}

$frontendUrl = "http://127.0.0.1:$FrontendPort"
$backendUrl = "http://127.0.0.1:$BackendPort/api/health"

Write-Host ""
Write-Host "AI guide local services are starting."
Write-Host "Frontend:      $frontendUrl"
Write-Host "Backend check: $backendUrl"
Write-Host "LiveTalking:   $digitalHumanBaseUrl"
Write-Host "Run dir:       $RunDir"
Write-Host ""
Write-Host "Logs:"
$services | ForEach-Object {
    if ($_.log) {
        Write-Host ("  {0}: {1}" -f $_.name, $_.log)
    }
}
Write-Host ""
Write-Host "Stop command:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-local.ps1"

if (-not $NoBrowser -and -not $DryRun) {
    Start-Sleep -Seconds 3
    Start-Process $frontendUrl
}
