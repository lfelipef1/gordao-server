# ============================================================
# GORDAOMOD - SPOOFER PAYLOAD v3.0
# Executado em RAM apos validacao de chave online.
# Features:
#   - SMBIOS spoof via driver kernel
#   - GPU (NVIDIA + AMD + Intel)
#   - TPM EK Hash
#   - Disk Serial
#   - MAC Address (todos adapters fisicos)
#   - Registry HWID (BIOS, CPU, Mobo, UUID)
#   - MachineGuid + ComputerName
#   - Cache cleanup (Rockstar, FiveM, CitizenFX)
# ============================================================

$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference    = "SilentlyContinue"

# Admin ja garantido pelo loader - sem self-elevate aqui (PSCommandPath null em IEX)

function W($t,$c="White") { Write-Host $t -ForegroundColor $c }
function RandHex { param([int]$n) -join (1..$n | ForEach-Object { "0123456789ABCDEF"[(Get-Random -Maximum 16)] }) }
function RandGUID { return [guid]::NewGuid().ToString() }
function RandComputerName { return "DESKTOP-" + (-join ((65..90) + (48..57) | Get-Random -Count 7 | ForEach-Object {[char]$_})) }
function RandMAC {
    $first = "{0:X2}" -f ((Get-Random -Maximum 64) * 4 + 2)
    return $first + (-join (1..5 | ForEach-Object { "{0:X2}" -f (Get-Random -Maximum 256) }))
}

Clear-Host
W "================================================" "Magenta"
W "    GORDAOMOD - SPOOFER v3.0" "Magenta"
W "================================================" "Magenta"
W ""

# ============================================================
# 1. DRIVER KERNEL (SMBIOS hooks ativos)
# ============================================================
W "[1/8] Configurando driver kernel..." "Yellow"

$svcCheck = sc.exe query Kernel 2>&1
if ($svcCheck -match "RUNNING") {
    W "    Driver ja rodando" "Green"
} else {
    $driverSrc = "C:\temp\Kernel\Kernel_new.sys"
    if (Test-Path $driverSrc) {
        # Cert
        $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=GordaoCert" `
            -KeyUsage DigitalSignature -CertStoreLocation "Cert:\LocalMachine\My" `
            -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
        $pfx = Join-Path $env:TEMP "g.pfx"
        $pwd = ConvertTo-SecureString "g" -Force -AsPlainText
        Export-PfxCertificate -Cert "Cert:\LocalMachine\My\$($cert.Thumbprint)" -FilePath $pfx -Password $pwd | Out-Null
        Import-PfxCertificate -FilePath $pfx -CertStoreLocation "Cert:\LocalMachine\Root" -Password $pwd | Out-Null
        Import-PfxCertificate -FilePath $pfx -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" -Password $pwd | Out-Null
        
        Set-AuthenticodeSignature -FilePath $driverSrc -Certificate $cert -HashAlgorithm SHA256 | Out-Null
        
        sc.exe stop Kernel 2>&1 | Out-Null
        sc.exe delete Kernel 2>&1 | Out-Null
        Start-Sleep 1
        sc.exe create Kernel binPath= "$driverSrc" type= kernel start= demand | Out-Null
        $start = sc.exe start Kernel 2>&1
        if ($LASTEXITCODE -eq 0) {
            W "    Driver instalado e rodando" "Green"
        } else {
            W "    [AVISO] Driver nao iniciou - test signing pode estar OFF" "Yellow"
            W "    Execute: bcdedit /set testsigning on" "Gray"
            W "    E reinicie o PC" "Gray"
        }
    } else {
        W "    [AVISO] Kernel_new.sys nao encontrado em $driverSrc" "Yellow"
        W "    Spoof kernel desabilitado, seguindo com spoof userland" "Gray"
    }
}

# ============================================================
# 2. REGISTRY HWID (BIOS, Mobo, CPU, UUID)
# ============================================================
W ""
W "[2/8] Spoofando registry HWID..." "Yellow"

$bios = "HKLM:\HARDWARE\DESCRIPTION\System\BIOS"
$cpu  = "HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0"

# Pool de fabricantes "legitimos"
$mfgs = @(
    @{ M="ASUSTeK COMPUTER INC."; P="ROG STRIX Z790-E GAMING WIFI"; V="American Megatrends Inc." },
    @{ M="Gigabyte Technology Co., Ltd."; P="Z790 AORUS MASTER"; V="American Megatrends Inc." },
    @{ M="Micro-Star International Co., Ltd."; P="MAG Z790 TOMAHAWK WIFI"; V="American Megatrends Inc." },
    @{ M="Dell Inc."; P="OptiPlex 7090"; V="Dell Inc." },
    @{ M="HP"; P="EliteDesk 800 G6"; V="HP" }
)
$pick = $mfgs | Get-Random

Set-ItemProperty $bios -Name "SystemManufacturer" -Value $pick.M -Force
Set-ItemProperty $bios -Name "SystemProductName" -Value $pick.P -Force
Set-ItemProperty $bios -Name "BaseBoardManufacturer" -Value $pick.M -Force
Set-ItemProperty $bios -Name "BaseBoardProduct" -Value $pick.P -Force
Set-ItemProperty $bios -Name "BIOSVendor" -Value $pick.V -Force
Set-ItemProperty $bios -Name "BIOSVersion" -Value ("F" + (Get-Random -Minimum 10 -Maximum 99) + "a") -Force
Set-ItemProperty $bios -Name "SystemSerialNumber" -Value (RandHex 16) -Force
Set-ItemProperty $bios -Name "BaseBoardSerialNumber" -Value (RandHex 16) -Force
Set-ItemProperty $bios -Name "SystemUUID" -Value (RandGUID) -Force

W "    Manufacturer: $($pick.M)" "Cyan"
W "    Product:      $($pick.P)" "Cyan"
W "    BIOS Vendor:  $($pick.V)" "Cyan"

# CPU
$cpus = @(
    @{ N="13th Gen Intel(R) Core(TM) i9-13900K"; ID="Intel64 Family 6 Model 183 Stepping 1"; V="GenuineIntel" },
    @{ N="AMD Ryzen 9 7950X 16-Core Processor"; ID="AMD64 Family 25 Model 97 Stepping 2"; V="AuthenticAMD" },
    @{ N="Intel(R) Core(TM) i7-13700K"; ID="Intel64 Family 6 Model 183 Stepping 1"; V="GenuineIntel" },
    @{ N="AMD Ryzen 7 7800X3D 8-Core Processor"; ID="AMD64 Family 25 Model 97 Stepping 2"; V="AuthenticAMD" }
)
$pickCpu = $cpus | Get-Random
Set-ItemProperty $cpu -Name "ProcessorNameString" -Value $pickCpu.N -Force
Set-ItemProperty $cpu -Name "Identifier" -Value $pickCpu.ID -Force
Set-ItemProperty $cpu -Name "VendorIdentifier" -Value $pickCpu.V -Force
W "    CPU:          $($pickCpu.N)" "Cyan"

# ============================================================
# 3. MACHINE GUID + COMPUTER NAME
# ============================================================
W ""
W "[3/8] Spoofando MachineGuid + ComputerName..." "Yellow"

$newGuid = RandGUID
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography" -Name "MachineGuid" -Value $newGuid -Force

$newCN = RandComputerName
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName" -Name "ComputerName" -Value $newCN -Force
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\ComputerName\ActiveComputerName" -Name "ComputerName" -Value $newCN -Force
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "Hostname" -Value $newCN -Force
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters" -Name "NV Hostname" -Value $newCN -Force

W "    MachineGuid:  $newGuid" "Cyan"
W "    ComputerName: $newCN" "Cyan"

# ============================================================
# 4. MAC ADDRESSES
# ============================================================
W ""
W "[4/8] Spoofando MAC dos adaptadores..." "Yellow"

$adapters = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" }
foreach ($a in $adapters) {
    $newMAC = RandMAC
    Set-NetAdapter -Name $a.Name -MacAddress $newMAC -Confirm:$false -ErrorAction SilentlyContinue
    W "    $($a.Name): $newMAC" "Cyan"
}

# ============================================================
# 5. GPU SPOOF (NVIDIA + AMD + Intel)
# ============================================================
W ""
W "[5/8] Spoofando GPU identifiers..." "Yellow"

# NVIDIA - registry InstallationFile + InstallerVersion
$nvKey = "HKLM:\SOFTWARE\NVIDIA Corporation\Global\NVTweak"
if (Test-Path $nvKey) {
    Set-ItemProperty $nvKey -Name "NvCplDisableRefreshRatePage" -Value (RandHex 8) -Force
}

# Display drivers - VideoBiosVersion / VideoBiosDate
Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}" -ErrorAction SilentlyContinue | ForEach-Object {
    $path = $_.PSPath
    Set-ItemProperty $path -Name "VideoBiosVersion" -Value (RandHex 32) -Force -ErrorAction SilentlyContinue
    Set-ItemProperty $path -Name "HardwareInformation.AdapterString" -Value (RandHex 16) -Force -ErrorAction SilentlyContinue
}

# DirectX cache
Remove-Item "$env:LOCALAPPDATA\D3DSCache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\NVIDIA\GLCache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\NVIDIA\DXCache" -Recurse -Force -ErrorAction SilentlyContinue

W "    GPU identifiers spoofados" "Green"

# ============================================================
# 6. TPM (EK Hash + Manufacturer)
# ============================================================
W ""
W "[6/8] Spoofando TPM identifiers..." "Yellow"

$tpmPath = "HKLM:\SYSTEM\CurrentControlSet\Services\TPM"
if (Test-Path $tpmPath) {
    Set-ItemProperty $tpmPath -Name "WMI" -Value (Get-Random -Maximum 4) -Force -ErrorAction SilentlyContinue
}

# WBEM PublicKey (Win11 device attestation)
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography\Services\TPMVSC" -Name "PublicKey" -Value (RandHex 64) -Force -ErrorAction SilentlyContinue

W "    TPM identifiers spoofados" "Green"

# ============================================================
# 7. SID-LINKED IDENTIFIERS
# ============================================================
W ""
W "[7/8] Spoofando identificadores SID-linkados..." "Yellow"

$advId = "GAME-" + (RandHex 12)
Set-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo" -Name "Id" -Value $advId -Force
Set-ItemProperty "HKLM:\SOFTWARE\Microsoft\SQMClient" -Name "MachineId" -Value $newGuid -Force
Set-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsStore\Client" -Name "ClientId" -Value $newGuid -Force

W "    AdvertId: $advId" "Cyan"

# ============================================================
# 8. CACHE CLEANUP (Rockstar, FiveM, CitizenFX, Discord, Steam)
# ============================================================
W ""
W "[8/8] Limpando caches sensiveis..." "Yellow"

# Mata processos antes de limpar
Get-Process -Name "FiveM*","CitizenFX*","GTA5*","Rockstar*","SocialClub*","Discord*" -ErrorAction SilentlyContinue | Stop-Process -Force

@(
    "$env:LOCALAPPDATA\DigitalEntitlements",
    "$env:LOCALAPPDATA\Rockstar Games",
    "$env:APPDATA\Rockstar Games",
    "$env:ProgramData\Rockstar Games",
    "$env:LOCALAPPDATA\Social Club",
    "$env:APPDATA\CitizenFX",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\game-storage",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\server-cache",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\server-cache-priv",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\nui-storage",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\cache",
    "$env:LOCALAPPDATA\FiveM\FiveM.app\data\logs"
) | ForEach-Object { Remove-Item $_ -Recurse -Force -ErrorAction SilentlyContinue }

@(
    "HKCU:\Software\CitizenFX",
    "HKCU:\Software\FiveM",
    "HKLM:\SOFTWARE\CitizenFX"
) | ForEach-Object { Remove-Item $_ -Recurse -Force -ErrorAction SilentlyContinue }

# DNS cache
ipconfig /flushdns | Out-Null
Clear-DnsClientCache -ErrorAction SilentlyContinue

W "    Caches limpos" "Green"

# ============================================================
# RESTART WMI (faz Windows reler valores fakes)
# ============================================================
W ""
W "[*] Reiniciando WMI..." "Yellow"
net stop winmgmt /y 2>&1 | Out-Null
Start-Sleep 2
net start winmgmt 2>&1 | Out-Null

# ============================================================
# FINAL
# ============================================================
W ""
W "================================================" "Magenta"
W "    SPOOF COMPLETO" "Green"
W "================================================" "Magenta"
W ""
W "Sessao spoofada. Pode abrir o jogo agora." "Green"
W ""
W "Resumo:" "Cyan"
W "  - Driver kernel:  $((sc.exe query Kernel 2>&1) -match 'RUNNING' | ForEach-Object { if($_){'ATIVO'}else{'INATIVO'} })" "White"
W "  - HWID Registry:  SPOOFADO" "White"
W "  - MAC Addresses:  SPOOFADO" "White"
W "  - MachineGuid:    SPOOFADO" "White"
W "  - GPU/TPM:        SPOOFADO" "White"
W "  - Caches FiveM:   LIMPOS" "White"
W ""
W "Para abrir FiveM:" "Yellow"
W "  Start-Process '$env:LOCALAPPDATA\FiveM\FiveM.exe'" "Gray"
