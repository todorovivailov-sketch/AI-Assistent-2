param(
  [string]$DefaultApiBaseUrl = "https://api.eu.vapi.ai",
  [string]$DefaultZadarmaNumber = "35924372749",
  [string]$DefaultAssistantName = "LeadSaver Booking Receptionist BG"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$resultPath = Join-Path $scriptDir "vapi-zadarma-setup-result.json"
$logPath = Join-Path $scriptDir "vapi-zadarma-setup.log"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$timestamp $Message" | Tee-Object -FilePath $logPath -Append
}

function Read-Secret {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Invoke-Vapi {
  param(
    [ValidateSet("GET", "POST", "PATCH")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $headers = @{
    Authorization = "Bearer $script:VapiPrivateKey"
    "Content-Type" = "application/json"
  }

  $uri = "$script:VapiApiBaseUrl$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }

  $json = $Body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
}

try {
  Write-Host ""
  Write-Host "=== Vapi + Zadarma setup ==="
  Write-Host "This script will not write secrets to disk."
  Write-Host ""

  $apiBase = Read-Host "Vapi API base URL [$DefaultApiBaseUrl]"
  if ([string]::IsNullOrWhiteSpace($apiBase)) {
    $apiBase = $DefaultApiBaseUrl
  }
  $script:VapiApiBaseUrl = $apiBase.Trim().TrimEnd("/")

  $script:VapiPrivateKey = (Read-Secret "Vapi Private Key").Trim()
  $zadarmaSipNumber = (Read-Host "Zadarma SIP login/number").Trim()
  $zadarmaSipPassword = (Read-Secret "Zadarma SIP password").Trim()
  $zadarmaNumber = Read-Host "Zadarma virtual number without plus [$DefaultZadarmaNumber]"
  if ([string]::IsNullOrWhiteSpace($zadarmaNumber)) {
    $zadarmaNumber = $DefaultZadarmaNumber
  }
  $zadarmaNumber = $zadarmaNumber.Replace("+", "").Replace(" ", "").Trim()
  if ($zadarmaNumber -notmatch "^\d{8,15}$") {
    Write-Host ""
    Write-Host "Invalid Zadarma number '$zadarmaNumber'. Use digits only, for example: $DefaultZadarmaNumber"
    Write-Host "Using default number: $DefaultZadarmaNumber"
    $zadarmaNumber = $DefaultZadarmaNumber
  }

  Write-Log "Using Vapi API base URL: $script:VapiApiBaseUrl"
  Write-Log "Using Zadarma number: $zadarmaNumber"

  Write-Log "Fetching Vapi assistants..."
  try {
    $assistants = Invoke-Vapi -Method GET -Path "/assistant"
  }
  catch {
    if ($_.Exception.Message -like "*(401)*" -or $_.Exception.Message -like "*Unauthorized*") {
      throw "Vapi returned 401 Unauthorized. Use the Private Key, not Public Key. Also make sure the API URL matches your dashboard: dashboard.eu.vapi.ai -> https://api.eu.vapi.ai, dashboard.vapi.ai -> https://api.vapi.ai."
    }
    throw
  }
  $assistant = $assistants | Where-Object { $_.name -eq $DefaultAssistantName } | Select-Object -First 1

  if ($null -eq $assistant) {
    Write-Host ""
    Write-Host "Could not find assistant named '$DefaultAssistantName'. Existing assistants:"
    $assistants | Select-Object name, id | Format-Table -AutoSize
    Write-Host ""
    $assistantId = Read-Host "Paste the assistant ID to assign to the number"
    $assistantName = "manual"
  }
  else {
    $assistantId = $assistant.id
    $assistantName = $assistant.name
    Write-Log "Found assistant: $assistantName ($assistantId)"
  }

  if ([string]::IsNullOrWhiteSpace($assistantId)) {
    throw "Assistant ID is required."
  }

  Write-Log "Creating Zadarma SIP trunk credential in Vapi..."
  $credentialBody = @{
    provider = "byo-sip-trunk"
    name = "Zadarma Trunk"
    gateways = @(
      @{
        ip = "sip.zadarma.com"
        inboundEnabled = $false
      }
    )
    outboundLeadingPlusEnabled = $true
    outboundAuthenticationPlan = @{
      authUsername = $zadarmaSipNumber
      authPassword = $zadarmaSipPassword
    }
  }

  $credential = Invoke-Vapi -Method POST -Path "/credential" -Body $credentialBody
  Write-Log "Created credential: $($credential.id)"

  Write-Log "Creating BYO phone number in Vapi..."
  $phoneNumber = $null
  try {
    $phoneBody = @{
      provider = "byo-phone-number"
      name = "Zadarma Sofia Number"
      number = $zadarmaNumber
      numberE164CheckEnabled = $false
      credentialId = $credential.id
    }
    $phoneNumber = Invoke-Vapi -Method POST -Path "/phone-number" -Body $phoneBody
    Write-Log "Created phone number: $($phoneNumber.id)"
  }
  catch {
    Write-Log "Phone number create failed. Trying to find existing number. Error: $($_.Exception.Message)"
    $existingNumbers = Invoke-Vapi -Method GET -Path "/phone-number"
    $phoneNumber = $existingNumbers | Where-Object {
      ($_.number -replace "\+", "" -replace " ", "") -eq $zadarmaNumber
    } | Select-Object -First 1

    if ($null -eq $phoneNumber) {
      throw
    }
    Write-Log "Found existing phone number: $($phoneNumber.id)"
  }

  Write-Log "Assigning assistant to phone number..."
  $updateBody = @{
    name = "Zadarma Sofia Number"
    assistantId = $assistantId
  }
  $updatedPhoneNumber = Invoke-Vapi -Method PATCH -Path "/phone-number/$($phoneNumber.id)" -Body $updateBody
  Write-Log "Assigned assistant to phone number."

  $sipHost = if ($script:VapiApiBaseUrl -like "*api.eu.vapi.ai*") { "sip.eu.vapi.ai" } else { "sip.vapi.ai" }
  $zadarmaExternalServer = "$zadarmaNumber@$sipHost"

  $result = [ordered]@{
    status = "ok"
    apiBaseUrl = $script:VapiApiBaseUrl
    credentialId = $credential.id
    phoneNumberId = $updatedPhoneNumber.id
    phoneNumber = $zadarmaNumber
    assistantId = $assistantId
    assistantName = $assistantName
    zadarmaExternalServer = $zadarmaExternalServer
    nextStep = "Set Zadarma Virtual Number External Server / SIP URI to $zadarmaExternalServer, then call +359 2 437 2749."
  }

  $result | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8

  Write-Host ""
  Write-Host "DONE."
  Write-Host ""
  Write-Host "Now set this in Zadarma External Server / SIP URI:"
  Write-Host $zadarmaExternalServer
  Write-Host ""
  Write-Host "Result saved to:"
  Write-Host $resultPath
  Write-Host ""
  Write-Host "After saving in Zadarma, call +359 2 437 2749."
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  $result = [ordered]@{
    status = "error"
    message = $_.Exception.Message
  }
  $result | ConvertTo-Json -Depth 20 | Set-Content -Path $resultPath -Encoding UTF8
  Write-Host ""
  Write-Host "ERROR:"
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Result saved to:"
  Write-Host $resultPath
  exit 1
}
