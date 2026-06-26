param(
  [int]$Port = 3000,
  [string]$ProjectPath = "C:\Users\Ivaylo\Desktop\AI Receptionist"
)

$ErrorActionPreference = "Stop"

$resolvedProject = (Resolve-Path -LiteralPath $ProjectPath).Path
$archiveLogs = Join-Path $resolvedProject "archive\dev-server"
$toolDir = Join-Path $resolvedProject "archive\tools"
New-Item -ItemType Directory -Force -Path $archiveLogs | Out-Null
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null

$cloudflared = Join-Path $toolDir "cloudflared.exe"
if (-not (Test-Path -LiteralPath $cloudflared)) {
  Write-Host "Downloading cloudflared..." -ForegroundColor Yellow
  Invoke-WebRequest `
    -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" `
    -OutFile $cloudflared `
    -UseBasicParsing
}

$existing = Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*cloudflared.exe* tunnel --url http://localhost:$Port*" -and
    $_.ProcessId -ne $PID
  }

foreach ($process in $existing) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

$log = Join-Path $archiveLogs "cloudflared-$Port.log"
$err = Join-Path $archiveLogs "cloudflared-$Port.err.log"
$urlPath = Join-Path $archiveLogs "cloudflared-$Port-url.txt"

Remove-Item -LiteralPath $log, $err, $urlPath -Force -ErrorAction SilentlyContinue

$process = Start-Process `
  -FilePath $cloudflared `
  -ArgumentList @("tunnel", "--url", "http://localhost:$Port", "--no-autoupdate") `
  -WorkingDirectory $resolvedProject `
  -WindowStyle Hidden `
  -RedirectStandardOutput $log `
  -RedirectStandardError $err `
  -PassThru

$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  $content = ""
  if (Test-Path -LiteralPath $log) {
    $content += Get-Content -Raw -LiteralPath $log -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $err) {
    $content += "`n"
    $content += Get-Content -Raw -LiteralPath $err -ErrorAction SilentlyContinue
  }

  $match = [regex]::Match($content, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
  if ($match.Success) {
    $url = $match.Value.Trim()
    break
  }
}

if (-not $url) {
  Write-Host "Tunnel did not return a URL yet. Check logs:" -ForegroundColor Yellow
  Write-Host $log
  Write-Host $err
  exit 1
}

$serverUrl = "$url/api/vapi/end-of-call"
Set-Content -LiteralPath $urlPath -Value $serverUrl -Encoding UTF8
$serverUrl | Set-Clipboard

Write-Host "Cloudflare tunnel started." -ForegroundColor Green
Write-Host "Server URL copied to clipboard:"
Write-Host $serverUrl
Write-Host "PID: $($process.Id)"
