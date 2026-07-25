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

function Get-ListeningProcessIds {
    param([int[]]$TargetPorts)

    $ownerIds = New-Object System.Collections.Generic.HashSet[int]
    foreach ($port in $TargetPorts) {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($connection in @($connections)) {
            if ($connection.OwningProcess) {
                [void]$ownerIds.Add([int]$connection.OwningProcess)
            }
        }
    }
    return @($ownerIds)
}

function Get-ProcessTree {
    param(
        [int[]]$RootProcessIds,
        [object[]]$ProcessSnapshot
    )

    $childrenByParent = @{}
    foreach ($processInfo in $ProcessSnapshot) {
        $parentId = [int]$processInfo.ParentProcessId
        if (-not $childrenByParent.ContainsKey($parentId)) {
            $childrenByParent[$parentId] = New-Object System.Collections.Generic.List[int]
        }
        $childrenByParent[$parentId].Add([int]$processInfo.ProcessId)
    }

    $depthByProcessId = @{}
    $pending = New-Object 'System.Collections.Generic.Queue[object]'
    foreach ($rootProcessId in $RootProcessIds) {
        $pending.Enqueue([pscustomobject]@{
            processId = [int]$rootProcessId
            depth = 0
        })
    }

    while ($pending.Count -gt 0) {
        $current = $pending.Dequeue()
        $currentId = [int]$current.processId
        $currentDepth = [int]$current.depth
        if ($depthByProcessId.ContainsKey($currentId) -and $depthByProcessId[$currentId] -ge $currentDepth) {
            continue
        }
        $depthByProcessId[$currentId] = $currentDepth

        if (-not $childrenByParent.ContainsKey($currentId)) {
            continue
        }
        foreach ($childId in $childrenByParent[$currentId]) {
            if ($childId -eq $currentId) {
                continue
            }
            $pending.Enqueue([pscustomobject]@{
                processId = [int]$childId
                depth = $currentDepth + 1
            })
        }
    }

    return @(
        $depthByProcessId.GetEnumerator() |
            ForEach-Object {
                [pscustomobject]@{
                    processId = [int]$_.Key
                    depth = [int]$_.Value
                }
            } |
            Sort-Object -Property @{ Expression = "depth"; Descending = $true }, @{ Expression = "processId"; Descending = $true }
    )
}

if (Test-Path -LiteralPath $PidFile) {
    $entries = Get-Content -LiteralPath $PidFile -Encoding UTF8 | ConvertFrom-Json
    foreach ($entry in @($entries)) {
        if ($null -ne $entry.pid) {
            [void]$processIds.Add([int]$entry.pid)
        }
    }
}

foreach ($ownerId in @(Get-ListeningProcessIds -TargetPorts $Ports)) {
    [void]$processIds.Add([int]$ownerId)
}

if ($processIds.Count -eq 0) {
    Write-Host "No local ai-man services were found."
    if (-not $DryRun -and (Test-Path -LiteralPath $PidFile)) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
    return
}

$processSnapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
$processTree = @(Get-ProcessTree -RootProcessIds @($processIds) -ProcessSnapshot $processSnapshot)

foreach ($processEntry in $processTree) {
    $processId = [int]$processEntry.processId
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

if (-not $DryRun) {
    $deadline = (Get-Date).AddSeconds(10)
    do {
        $remainingOwnerIds = @(Get-ListeningProcessIds -TargetPorts $Ports)
        if ($remainingOwnerIds.Count -eq 0) {
            break
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    if ($remainingOwnerIds.Count -gt 0) {
        Write-Warning ("Some target ports are still listening after process-tree shutdown. Remaining PIDs: {0}" -f ($remainingOwnerIds -join ", "))
    }
}

if (-not $DryRun -and (Test-Path -LiteralPath $PidFile)) {
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}
