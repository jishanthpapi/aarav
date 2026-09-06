param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$archivePath = [System.IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $archivePath) { throw "Destination already exists: $archivePath" }
Add-Type -AssemblyName System.IO.Compression
$files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
function Collect-Source([string]$directory) {
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if ($entry.PSIsContainer) {
      if ($entry.Name -notin @('node_modules','dist','.git') -and -not ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { Collect-Source $entry.FullName }
    } elseif (($entry.Name -notlike '.env*' -or $entry.Name -eq '.env.example') -and $entry.Name -notlike '*.tsbuildinfo' -and $entry.Extension -ne '.zip') {
      $files.Add($entry)
    }
  }
}
Collect-Source $projectRoot
$stream = [IO.File]::Open($archivePath,[IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($projectRoot,$file.FullName).Replace('\','/')
    if ($relative.StartsWith('../') -or [IO.Path]::IsPathRooted($relative)) { throw 'Unexpected source path.' }
    $entry = $archive.CreateEntry($relative,[IO.Compression.CompressionLevel]::Optimal)
    $source = $file.OpenRead(); $target = $entry.Open()
    try { $source.CopyTo($target) } finally { $target.Dispose(); $source.Dispose() }
  }
} finally { $archive.Dispose(); $stream.Dispose() }
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  if ($archive.Entries.Count -ne $files.Count) { throw 'Archive file count differs from source.' }
  foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($projectRoot,$file.FullName).Replace('\','/')
    $entry = $archive.GetEntry($relative)
    if (-not $entry) { throw "Missing archive entry: $relative" }
    $source = $file.OpenRead(); $packed = $entry.Open()
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
      $a = [Convert]::ToHexString($hash.ComputeHash($source))
      $b = [Convert]::ToHexString($hash.ComputeHash($packed))
      if ($a -ne $b) { throw "Archive bytes differ: $relative" }
    } finally { $hash.Dispose(); $source.Dispose(); $packed.Dispose() }
  }
  [pscustomobject]@{ Archive=$archivePath; Files=$files.Count; SHA256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash; Verified='Every relative path and file hash' } | ConvertTo-Json
} finally { $archive.Dispose() }
