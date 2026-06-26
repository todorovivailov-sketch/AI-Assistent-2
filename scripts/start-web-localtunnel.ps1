param(
  [int]$Port = 3000,
  [string]$ProjectPath = "C:\Users\Ivaylo\Desktop\AI Receptionist"
)

$ErrorActionPreference = "Stop"

$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$archiveLogs = Join-Path $resolvedProject "archive\dev-server"
New-Item -ItemType Directory -Force -Path $archiveLogs | Out-Null

$log = Join-Path $archiveLogs "localtunnel-$Port.log"
$err = Join-Path $archiveLogs "localtunnel-$Port.err.log"

if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
if (Test-Path -LiteralPath $err) { Remove-Item -LiteralPath $err -Force }

$npx = "C:\Program Files\nodejs\npx.cmd"
$process = Start-Process -FilePath $npx -ArgumentList @("--yes", "localtunnel", "--port", "$Port") -WorkingDirectory $resolvedProject -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru

Start-Sleep -Seconds 8

$content = if (Test-Path -LiteralPath $log) { Get-Content -Raw $log } else { "" }
$match = [regex]::Match($content, "https://[^\s]+")

if (-not $match.Success) {
  Write-Host "Tunnel did not return a URL yet. Check logs:" -ForegroundColor Yellow
  Write-Host $log
  Write-Host $err
  exit 1
}

$url = $match.Value.Trim()
$serverUrl = "$url/api/vapi/end-of-call"
$urlPath = Join-Path $archiveLogs "localtunnel-$Port-url.txt"
Set-Content -LiteralPath $urlPath -Value $serverUrl -Encoding UTF8
$serverUrl | Set-Clipboard

Write-Host "Tunnel started." -ForegroundColor Green
Write-Host "Server URL copied to clipboard:"
Write-Host $serverUrl
Write-Host "PID: $($process.Id)"

