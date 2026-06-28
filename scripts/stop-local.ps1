[CmdletBinding()]
param(
    [int[]]$Ports = @(8010, 8000, 5173),
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$RunDir = Join-Path $env:TEMP "ai-man-local-run"
$PidFile = Join-Path $RunDir "pids.json"
$processIds = New-Object System.Collections.Generic.HashSet[int]

if (Test-Path -LiteralPath $PidFile) {
    $entries = Get-Content -LiteralPath $PidFile -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in @($entries)) {
        if ($null -ne $entry.pid) {
            [void]$processIds.Add([int]$entry.pid)
        }
    }
}

foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in @($connections)) {
        if ($connection.OwningProcess) {
            [void]$processIds.Add([int]$connection.OwningProcess)
        }
    }
}

if ($processIds.Count -eq 0) {
    Write-Host "No local ai-man services were found."
    return
}

foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) {
        continue
    }
    if ($DryRun) {
        Write-Host "Would stop PID $processId ($($process.ProcessName))"
        continue
    }
    Write-Host "Stopping PID $processId ($($process.ProcessName))"
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

if (-not $DryRun -and (Test-Path -LiteralPath $PidFile)) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}
