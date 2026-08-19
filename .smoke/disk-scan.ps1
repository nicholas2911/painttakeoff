$ErrorActionPreference = 'SilentlyContinue'
$root = 'C:\Users\Nicholas'
Get-ChildItem -LiteralPath $root -Force -Directory | ForEach-Object {
  $size = (Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
  [PSCustomObject]@{ Folder = $_.FullName; GB = [math]::Round($size / 1GB, 2) }
} | Sort-Object GB -Descending | Select-Object -First 25 | Format-Table -AutoSize
