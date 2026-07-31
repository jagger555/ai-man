[CmdletBinding()]
param(
    [string]$ProjectRoot = "",
    [string]$LiveTalkingPath = "",
    [string]$LiveTalkingPython = "",
    [string]$LiveTalkingCondaEnv = "livetalking",
    [int]$LiveTalkingPort = 8010,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [string]$LiveTalkingModel = "wav2lip",
    [string]$LiveTalkingTts = "qwentts",
    [string]$LiveTalkingVoice = "Cherry",
    [string]$LiveTalkingAvatarId = "626",
    [int]$LiveTalkingBatchSize = 16,
    [int]$LiveTalkingMaxSession = 2,
    [int]$LiveTalkingReadyTimeoutSeconds = 90,
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

function Test-HttpReady {
    param([string]$Url)

    $previousProgressPreference = $ProgressPreference
    $ProgressPreference = "SilentlyContinue"
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    }
    catch {
        return $false
    }
    finally {
        $ProgressPreference = $previousProgressPreference
    }
}

function Wait-HttpReady {
    param(
        [string]$Name,
        [string]$Url,
        [int]$TimeoutSeconds
    )

    Write-Host "Waiting for $Name HTTP readiness: $Url"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-HttpReady $Url) {
            Write-Host "$Name is ready."
            return $true
        }
        Start-Sleep -Seconds 2
    }

    return $false
}

function Test-BackendDigitalHumanConfig {
    param(
        [string]$BackendUrl,
        [string]$ExpectedBaseUrl
    )

    $configUrl = "$BackendUrl/api/digital-human/config"
    $previousProgressPreference = $ProgressPreference
    $ProgressPreference = "SilentlyContinue"
    try {
        $response = Invoke-WebRequest -Uri $configUrl -UseBasicParsing -TimeoutSec 3
        $config = $response.Content | ConvertFrom-Json
        if (-not $config.base_url) {
            Write-Warning "Backend is running, but /api/digital-human/config returned an empty base_url. Restart the backend or rerun this script after stopping port $BackendPort."
            return $false
        }
        if ($config.base_url -ne $ExpectedBaseUrl) {
            Write-Warning "Backend DIGITAL_HUMAN_BASE_URL is '$($config.base_url)', expected '$ExpectedBaseUrl'. Reused backend processes keep their old environment."
            return $false
        }
        return $true
    }
    catch {
        Write-Warning "Could not verify backend digital human config at ${configUrl}: $($_.Exception.Message)"
        return $false
    }
    finally {
        $ProgressPreference = $previousProgressPreference
    }
}

function Get-PortOwnerProcesses {
    param([int]$Port)

    try {
        $ownerIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
    }
    catch {
        return @()
    }

    $owners = @()
    foreach ($ownerId in $ownerIds) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId" -ErrorAction SilentlyContinue
        if ($owner) {
            $owners += $owner
        }
    }
    return $owners
}

function Test-LiveTalkingProcess {
    param([object]$ProcessInfo)

    $name = [string]$ProcessInfo.Name
    $executable = [string]$ProcessInfo.ExecutablePath
    $commandLine = [string]$ProcessInfo.CommandLine
    $isPython = $name -ieq "python.exe" -or $executable -match "python"
    return ($isPython -and $commandLine -match "\bapp\.py\b" -and $commandLine -match "--transport\s+webrtc")
}

function Stop-StaleLiveTalkingPortOwner {
    param([int]$Port)

    $owners = @(Get-PortOwnerProcesses -Port $Port)
    $liveTalkingOwners = @($owners | Where-Object { Test-LiveTalkingProcess -ProcessInfo $_ })
    if ($liveTalkingOwners.Count -eq 0) {
        return $false
    }

    foreach ($owner in $liveTalkingOwners) {
        Write-Host ("Stopping stale LiveTalking process {0}: {1}" -f $owner.ProcessId, $owner.CommandLine)
        Stop-Process -Id $owner.ProcessId -Force -ErrorAction Stop
    }

    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-TcpPortOpen "127.0.0.1" $Port)) {
            return $true
        }
        Start-Sleep -Seconds 1
    }

    return (-not (Test-TcpPortOpen "127.0.0.1" $Port))
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

function Get-DotEnvValue {
    param(
        [string]$Path,
        [string[]]$Names
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmedLine = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith("#")) {
            continue
        }

        foreach ($name in $Names) {
            $prefix = "$name="
            if (-not $trimmedLine.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }

            $value = $trimmedLine.Substring($prefix.Length).Trim()
            if ($value.Length -ge 2) {
                $first = $value[0]
                $last = $value[$value.Length - 1]
                if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
            }
            return $value
        }
    }

    return $null
}

function Initialize-LiveTalkingTtsEnvironment {
    param(
        [string]$Tts,
        [string]$BackendEnvPath
    )

    if ($Tts -ine "qwentts" -or -not [string]::IsNullOrWhiteSpace($env:DASHSCOPE_API_KEY)) {
        return
    }

    $apiKey = Get-DotEnvValue -Path $BackendEnvPath -Names @(
        "DASHSCOPE_API_KEY",
        "BAILIAN_API_KEY",
        "SPEECH_API_KEY"
    )
    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        throw "QwenTTS requires DASHSCOPE_API_KEY or BAILIAN_API_KEY in backend\.env"
    }

    # Set the key only in this launcher process.  Child processes inherit it,
    # while the secret stays out of the command line and startup log.
    $env:DASHSCOPE_API_KEY = $apiKey
    Write-Host "Loaded the QwenTTS credential from backend\.env."
}

function Start-LiveTalkingService {
    param(
        [string]$WorkingDirectory,
        [string]$PythonExecutable,
        [int]$Port,
        [string]$Model,
        [string]$Tts,
        [string]$Voice,
        [string]$AvatarId,
        [int]$BatchSize,
        [int]$MaxSession
    )

    $liveLog = Join-Path $LogDir "livetalking.log"
    $liveCommand = "& $(Quote-PS $PythonExecutable) app.py --transport webrtc --model $(Quote-PS $Model) --avatar_id $(Quote-PS $AvatarId) --tts $(Quote-PS $Tts) --REF_FILE $(Quote-PS $Voice) --batch_size $BatchSize --listenport $Port --max_session $MaxSession 2>&1 | Tee-Object -FilePath $(Quote-PS $liveLog) -Append"
    $liveProcess = Start-ManagedProcess -Name "livetalking" -WorkingDirectory $WorkingDirectory -Command $liveCommand
    return [pscustomobject]@{
        name = "livetalking"
        pid = if ($liveProcess) { $liveProcess.Id } else { $null }
        port = $Port
        log = $liveLog
        reused = $false
    }
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

function Resolve-LiveTalkingPython {
    param(
        [string]$RequestedPython,
        [string]$CondaEnv
    )

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($RequestedPython)) {
        $candidates += $RequestedPython
    }
    elseif (-not [string]::IsNullOrWhiteSpace($env:LIVETALKING_PYTHON)) {
        $candidates += $env:LIVETALKING_PYTHON
    }

    if (-not [string]::IsNullOrWhiteSpace($CondaEnv)) {
        $condaBases = @()
        if (-not [string]::IsNullOrWhiteSpace($env:CONDA_PREFIX)) {
            $condaBases += $env:CONDA_PREFIX
        }
        $condaCommand = Get-Command conda -ErrorAction SilentlyContinue
        if ($condaCommand) {
            try {
                $condaBase = (& conda info --base 2>$null | Select-Object -First 1)
                if (-not [string]::IsNullOrWhiteSpace($condaBase)) {
                    $condaBases += $condaBase
                }
            }
            catch {
                Write-Warning "Unable to query conda base path; trying known local paths."
            }
        }
        $condaBases += @("D:\anaconda", "$env:USERPROFILE\anaconda3", "$env:USERPROFILE\miniconda3")

        foreach ($condaBase in ($condaBases | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
            $envPython = Join-Path $condaBase "envs\$CondaEnv\python.exe"
            $candidates += $envPython
        }
    }

    $candidates += "python"

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }

    throw "No Python executable was found for LiveTalking"
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
if ([string]::IsNullOrWhiteSpace($LiveTalkingPath)) {
    $LiveTalkingPath = Join-Path $ProjectRoot "LiveTalking"
}
$RunDir = Join-Path $env:TEMP "ai-man-local-run"
$LogDir = Join-Path $RunDir "logs"
$PidFile = Join-Path $RunDir "pids.json"

Require-Path "Project root" $ProjectRoot
Require-Path "Backend path" $BackendPath
Require-Path "Frontend path" $FrontendPath

if (-not $SkipLiveTalking) {
    Require-Path "LiveTalking path" $LiveTalkingPath
    $LiveTalkingPath = Resolve-LiveTalkingPath $LiveTalkingPath
    $LiveTalkingPython = Resolve-LiveTalkingPython -RequestedPython $LiveTalkingPython -CondaEnv $LiveTalkingCondaEnv
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
$liveTalkingReused = $false

if (-not $SkipLiveTalking) {
    if (Test-TcpPortOpen "127.0.0.1" $LiveTalkingPort) {
        Write-Host "LiveTalking port $LiveTalkingPort is already open. Reusing it instead of starting another copy."
        $liveTalkingReused = $true
        $services += [pscustomobject]@{
            name = "livetalking"
            pid = $null
            port = $LiveTalkingPort
            log = $null
            reused = $true
        }
    }
    else {
        Initialize-LiveTalkingTtsEnvironment -Tts $LiveTalkingTts -BackendEnvPath (Join-Path $BackendPath ".env")
        $services += Start-LiveTalkingService -WorkingDirectory $LiveTalkingPath -PythonExecutable $LiveTalkingPython -Port $LiveTalkingPort -Model $LiveTalkingModel -Tts $LiveTalkingTts -Voice $LiveTalkingVoice -AvatarId $LiveTalkingAvatarId -BatchSize $LiveTalkingBatchSize -MaxSession $LiveTalkingMaxSession
    }
}

if (-not $SkipLiveTalking -and -not $DryRun) {
    $readyTimeout = $LiveTalkingReadyTimeoutSeconds
    if ($liveTalkingReused -and $readyTimeout -gt 30) {
        $readyTimeout = 30
    }
    $liveTalkingReadyUrl = "$digitalHumanBaseUrl/index.html"
    if (-not (Wait-HttpReady -Name "LiveTalking" -Url $liveTalkingReadyUrl -TimeoutSeconds $readyTimeout)) {
        $didRestartLiveTalking = $false
        if ($liveTalkingReused) {
            Write-Warning "Port $LiveTalkingPort is open but not responding as LiveTalking. Checking whether it is a stale LiveTalking process."
            if (Stop-StaleLiveTalkingPortOwner -Port $LiveTalkingPort) {
                Write-Host "Restarting LiveTalking on port $LiveTalkingPort."
                $services = @($services | Where-Object { $_.name -ne "livetalking" })
                Initialize-LiveTalkingTtsEnvironment -Tts $LiveTalkingTts -BackendEnvPath (Join-Path $BackendPath ".env")
                $services += Start-LiveTalkingService -WorkingDirectory $LiveTalkingPath -PythonExecutable $LiveTalkingPython -Port $LiveTalkingPort -Model $LiveTalkingModel -Tts $LiveTalkingTts -Voice $LiveTalkingVoice -AvatarId $LiveTalkingAvatarId -BatchSize $LiveTalkingBatchSize -MaxSession $LiveTalkingMaxSession
                $didRestartLiveTalking = $true
                if (-not (Wait-HttpReady -Name "LiveTalking" -Url $liveTalkingReadyUrl -TimeoutSeconds $LiveTalkingReadyTimeoutSeconds)) {
                    Write-Warning "LiveTalking restarted, but it still did not answer $liveTalkingReadyUrl within $LiveTalkingReadyTimeoutSeconds seconds."
                }
            }
        }
        if (-not $didRestartLiveTalking) {
            Write-Warning "Port $LiveTalkingPort is open, but LiveTalking did not answer $liveTalkingReadyUrl within $readyTimeout seconds. If this is not the LiveTalking process, stop that port owner or pass -LiveTalkingPort with another free port."
        }
    }
}

if (Test-TcpPortOpen "127.0.0.1" $BackendPort) {
    Write-Host "Backend port $BackendPort is already open. Reusing it."
    [void](Test-BackendDigitalHumanConfig -BackendUrl "http://127.0.0.1:$BackendPort" -ExpectedBaseUrl $digitalHumanBaseUrl)
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
    $backendCommand = "`$env:DIGITAL_HUMAN_BASE_URL = $(Quote-PS $digitalHumanBaseUrl); `$env:DIGITAL_HUMAN_AVATAR = $(Quote-PS $LiveTalkingAvatarId); `$env:LIVETALKING_ROOT = $(Quote-PS $LiveTalkingPath); python -m uvicorn app.main:app --host 127.0.0.1 --port $BackendPort 2>&1 | Tee-Object -FilePath $(Quote-PS $backendLog) -Append"
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
if (-not $SkipLiveTalking) {
    Write-Host "LiveTalking Python: $LiveTalkingPython"
}
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
