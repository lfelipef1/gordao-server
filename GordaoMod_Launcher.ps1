# ============================================================
# GORDAOMOD - LAUNCHER v3.0 PRO
# Valida chave online e abre spoofer GUI
# ============================================================

# Auto-elevacao
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`""
    exit
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "SilentlyContinue"
$scriptDir = Split-Path $MyInvocation.MyCommand.Path
$API = 'https://rack-gordao.onrender.com'

# ============================================================
# FORM LOGIN
# ============================================================
$form = New-Object System.Windows.Forms.Form
$form.Text = "GordaoMod - Launcher v3.0"
$form.Size = New-Object System.Drawing.Size(560, 720)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedSingle"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 8, 12)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 10)

# Logo
$logoPath = Join-Path $scriptDir "logo.png"
$logoBox = New-Object System.Windows.Forms.PictureBox
$logoBox.Size = New-Object System.Drawing.Size(460, 190)
$logoBox.Location = New-Object System.Drawing.Point((560-460)/2, 10)
$logoBox.SizeMode = "Zoom"
if (Test-Path $logoPath) { $logoBox.Image = [System.Drawing.Image]::FromFile($logoPath) }
$form.Controls.Add($logoBox)

# Subtitulo
$subLabel = New-Object System.Windows.Forms.Label
$subLabel.Text = "SPOOFER PRO v3.0"
$subLabel.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$subLabel.ForeColor = [System.Drawing.Color]::FromArgb(139, 92, 246)
$subLabel.Location = New-Object System.Drawing.Point(0, 200)
$subLabel.Size = New-Object System.Drawing.Size(560, 24)
$subLabel.TextAlign = "MiddleCenter"
$form.Controls.Add($subLabel)

# Card central
$card = New-Object System.Windows.Forms.Panel
$card.Size = New-Object System.Drawing.Size(460, 320)
$card.Location = New-Object System.Drawing.Point(50, 245)
$card.BackColor = [System.Drawing.Color]::FromArgb(14, 14, 18)
$form.Controls.Add($card)

# Titulo dentro do card
$cardTitle = New-Object System.Windows.Forms.Label
$cardTitle.Text = "Validar Licenca"
$cardTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$cardTitle.ForeColor = [System.Drawing.Color]::White
$cardTitle.Location = New-Object System.Drawing.Point(0, 20)
$cardTitle.Size = New-Object System.Drawing.Size(460, 30)
$cardTitle.TextAlign = "MiddleCenter"
$card.Controls.Add($cardTitle)

# Label chave
$keyLabel = New-Object System.Windows.Forms.Label
$keyLabel.Text = "Chave de Licenca"
$keyLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$keyLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 150)
$keyLabel.Location = New-Object System.Drawing.Point(40, 65)
$keyLabel.Size = New-Object System.Drawing.Size(380, 18)
$card.Controls.Add($keyLabel)

# Input chave
$keyInput = New-Object System.Windows.Forms.TextBox
$keyInput.Size = New-Object System.Drawing.Size(380, 36)
$keyInput.Location = New-Object System.Drawing.Point(40, 88)
$keyInput.BackColor = [System.Drawing.Color]::FromArgb(25, 25, 30)
$keyInput.ForeColor = [System.Drawing.Color]::White
$keyInput.BorderStyle = "FixedSingle"
$keyInput.Font = New-Object System.Drawing.Font("Consolas", 12)
$keyInput.CharacterCasing = "Upper"
$keyInput.MaxLength = 39
$card.Controls.Add($keyInput)

# Placeholder
$placeholder = New-Object System.Windows.Forms.Label
$placeholder.Text = "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
$placeholder.Font = New-Object System.Drawing.Font("Consolas", 12)
$placeholder.ForeColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$placeholder.Location = New-Object System.Drawing.Point(45, 91)
$placeholder.Size = New-Object System.Drawing.Size(370, 24)
$placeholder.BackColor = [System.Drawing.Color]::FromArgb(25, 25, 30)
$card.Controls.Add($placeholder)

# Evento input
$keyInput.Add_TextChanged({
    if ($keyInput.Text.Length -gt 0) { $placeholder.Visible = $false } else { $placeholder.Visible = $true }
    $cursor = $keyInput.SelectionStart
    $t = $keyInput.Text -replace '-', ''
    if ($t.Length -gt 32) { $t = $t.Substring(0, 32) }
    $formatted = ''
    for ($i = 0; $i -lt $t.Length; $i++) {
        if ($i -gt 0 -and $i % 4 -eq 0) { $formatted += '-' }
        $formatted += $t[$i]
    }
    if ($formatted -ne $keyInput.Text) {
        $keyInput.Text = $formatted
        $keyInput.SelectionStart = $cursor + 1
    }
})

# Botao validar
$btnValidate = New-Object System.Windows.Forms.Button
$btnValidate.Text = "VALIDAR CHAVE"
$btnValidate.Size = New-Object System.Drawing.Size(380, 48)
$btnValidate.Location = New-Object System.Drawing.Point(40, 145)
$btnValidate.FlatStyle = "Flat"
$btnValidate.FlatAppearance.BorderSize = 0
$btnValidate.BackColor = [System.Drawing.Color]::FromArgb(124, 58, 237)
$btnValidate.ForeColor = [System.Drawing.Color]::White
$btnValidate.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$btnValidate.Cursor = "Hand"
$btnValidate.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(139, 92, 246)
$card.Controls.Add($btnValidate)

# Status
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = ""
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$statusLabel.Location = New-Object System.Drawing.Point(40, 205)
$statusLabel.Size = New-Object System.Drawing.Size(380, 24)
$statusLabel.TextAlign = "MiddleCenter"
$card.Controls.Add($statusLabel)

# Info
$infoLabel = New-Object System.Windows.Forms.Label
$infoLabel.Text = "Requer conexao com a internet.`nA chave e vinculada ao seu HWID."
$infoLabel.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$infoLabel.ForeColor = [System.Drawing.Color]::FromArgb(100, 100, 100)
$infoLabel.Location = New-Object System.Drawing.Point(40, 240)
$infoLabel.Size = New-Object System.Drawing.Size(380, 40)
$infoLabel.TextAlign = "MiddleCenter"
$card.Controls.Add($infoLabel)

# Footer
$footer = New-Object System.Windows.Forms.Label
$footer.Text = "GordaoMod  2026"
$footer.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$footer.ForeColor = [System.Drawing.Color]::FromArgb(50, 50, 50)
$footer.Location = New-Object System.Drawing.Point(0, 660)
$footer.Size = New-Object System.Drawing.Size(560, 20)
$footer.TextAlign = "MiddleCenter"
$form.Controls.Add($footer)

# ============================================================
# WAKE SERVER - acorda o Render antes de validar
# ============================================================
function Wake-Server {
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 150)
    $statusLabel.Text = "Acordando servidor..."
    [System.Windows.Forms.Application]::DoEvents()

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $ping = Invoke-WebRequest -Uri "$API/api/ping" -TimeoutSec 90 -UseBasicParsing
        Write-Host "Server awake: $($ping.StatusCode)"
    } catch {
        try {
            $ping = Invoke-WebRequest -Uri "$API/" -TimeoutSec 90 -UseBasicParsing
            Write-Host "Server awake (root): $($ping.StatusCode)"
        } catch {
            Write-Host "Wake failed: $($_.Exception.Message)"
        }
    }
}

# ============================================================
# VALIDACAO
# ============================================================
function Validate-Key() {
    $key = $keyInput.Text.Trim() -replace '-', ''
    
    if ($key.Length -ne 32) {
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        $statusLabel.Text = "Chave invalida. Formato: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
        return
    }
    
    $btnValidate.Enabled = $false
    $btnValidate.Text = "VALIDANDO..."
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 150)
    $statusLabel.Text = "Conectando ao servidor..."
    [System.Windows.Forms.Application]::DoEvents()
    
    # Acorda o servidor primeiro
    Wake-Server

    $statusLabel.Text = "Validando chave..."
    [System.Windows.Forms.Application]::DoEvents()

    $maxRetries = 3
    $retryCount = 0
    $data = $null

    while ($retryCount -lt $maxRetries -and -not $data) {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $body = @{ key = $keyInput.Text.Trim(); hwid = (Get-WmiObject Win32_ComputerSystemProduct).UUID } | ConvertTo-Json
            $res = Invoke-WebRequest -Uri "$API/api/validate" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 90 -UseBasicParsing
            $data = $res.Content | ConvertFrom-Json
        } catch [System.Net.WebException] {
            if ($_.Exception.Response) {
                try {
                    $stream = $_.Exception.Response.GetResponseStream()
                    $reader = New-Object System.IO.StreamReader($stream)
                    $reader.BaseStream.Position = 0
                    $reader.DiscardBufferedData()
                    $json = $reader.ReadToEnd()
                    $data = $json | ConvertFrom-Json
                } catch {
                    $retryCount++
                    if ($retryCount -lt $maxRetries) {
                        $statusLabel.Text = "Tentando novamente... ($retryCount/$maxRetries)"
                        [System.Windows.Forms.Application]::DoEvents()
                        Start-Sleep -Seconds 3
                    }
                }
            } else {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    $statusLabel.Text = "Servidor acordando... tentando novamente ($retryCount/$maxRetries)"
                    [System.Windows.Forms.Application]::DoEvents()
                    Start-Sleep -Seconds 5
                }
            }
        } catch {
            $retryCount++
            if ($retryCount -lt $maxRetries) {
                $statusLabel.Text = "Reconectando... ($retryCount/$maxRetries)"
                [System.Windows.Forms.Application]::DoEvents()
                Start-Sleep -Seconds 3
            }
        }
    }
    
    if (-not $data) {
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        $statusLabel.Text = "Erro de conexao. Tente novamente."
        $btnValidate.Enabled = $true
        $btnValidate.Text = "VALIDAR CHAVE"
        return
    }
    
    if ($data.ok -eq $true) {
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(34, 197, 94)
        $statusLabel.Text = "Chave validada! Abrindo..."
        
        Start-Sleep -Milliseconds 800
        
        $form.Hide()
        $guiPath = Join-Path $scriptDir "SpooferGordao_GUI.ps1"
        if (Test-Path $guiPath) {
            Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$guiPath`"" -WindowStyle Hidden
        } else {
            [System.Windows.Forms.MessageBox]::Show("Spoofer nao encontrado.`n$guiPath", "Erro", "OK", "Error") | Out-Null
        }
        $form.Close()
    } else {
        $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
        $statusLabel.Text = $data.error
        $btnValidate.Enabled = $true
        $btnValidate.Text = "VALIDAR CHAVE"
    }
}

$btnValidate.Add_Click({ Validate-Key })
$keyInput.Add_KeyDown({ if ($_.KeyCode -eq "Enter") { Validate-Key } })

# Show
[void]$form.ShowDialog()
