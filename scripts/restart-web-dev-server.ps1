param(
  [int]$Port = 3000,
  [string]$WebAppPath = "C:\Users\Ivaylo\Desktop\AI Receptionist\apps\web"
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $WebAppPath "..\..")).Path
$resolvedWebApp = (Resolve-Path -LiteralPath $WebAppPath).Path
$archiveLogs = Join-Path $projectRoot "archive\dev-server"
New-Item -ItemType Directory -Force -Path $archiveLogs | Out-Null

$listeners = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
foreach ($listener in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if ($process -and ($process.CommandLine -like "*next dev*" -or $process.CommandLine -like "*npm run dev*")) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 2

$log = Join-Path $archiveLogs "web-$Port.log"
$err = Join-Path $archiveLogs "web-$Port.err.log"
$cmd = "/c npm run dev -- --port $Port > `"$log`" 2> `"$err`""
$process = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -WorkingDirectory $resolvedWebApp -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 4

Write-Host "Dev server started." -ForegroundColor Green
Write-Host "URL: http://localhost:$Port"
Write-Host "PID: $($process.Id)"
Write-Host "Log: $log"
Write-Host "Error log: $err"

