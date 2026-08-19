$ErrorActionPreference = 'SilentlyContinue'
function Show-Tree($path, $top) {
  Write-Output "`n===== $path ====="
  Get-ChildItem -LiteralPath $path -Force -Directory | ForEach-Object {
    $size = (Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{ Folder = $_.Name; GB = [math]::Round($size / 1GB, 2) }
  } | Sort-Object GB -Descending | Select-Object -First $top | Format-Table -AutoSize
}
Show-Tree 'C:\Program Files (x86)' 12
Show-Tree 'C:\Users\Nicholas\aycd' 10
Show-Tree 'C:\Users\Nicholas\AppData\Local' 12
Show-Tree 'C:\Users\Nicholas\AppData\Roaming' 10
Show-Tree 'C:\Users\Nicholas\Desktop' 12
