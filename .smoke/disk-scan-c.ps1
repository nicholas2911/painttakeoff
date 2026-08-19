$ErrorActionPreference = 'SilentlyContinue'
Get-ChildItem -LiteralPath 'C:\' -Force -Directory | ForEach-Object {
  $size = (Get-ChildItem -LiteralPath $_.FullName -Recurse -Force -File | Measure-Object -Property Length -Sum).Sum
  [PSCustomObject]@{ Folder = $_.FullName; GB = [math]::Round($size / 1GB, 2) }
} | Sort-Object GB -Descending | Format-Table -AutoSize
