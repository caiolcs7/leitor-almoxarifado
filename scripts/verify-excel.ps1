param([Parameter(Mandatory=$true)][string]$WorkbookPath,[Parameter(Mandatory=$true)][string]$PdfPath)
$ErrorActionPreference = 'Stop'
$excelApp = $null
$reportBook = $null
$reportSheet = $null
try {
  $excelApp = New-Object -ComObject Excel.Application
  $excelApp.Visible = $false
  $excelApp.DisplayAlerts = $false
  $excelApp.AutomationSecurity = 3
  $reportBook = $excelApp.Workbooks.Open([IO.Path]::GetFullPath($WorkbookPath), 0, $true)
  $reportSheet = $reportBook.Worksheets.Item('Todos os registros')
  $result = [ordered]@{
    application = 'Microsoft Excel'
    version = $excelApp.Version
    worksheet = $reportSheet.Name
    rows = $reportSheet.UsedRange.Rows.Count
    columns = $reportSheet.UsedRange.Columns.Count
    headerA = $reportSheet.Range('A5').Text
    headerB = $reportSheet.Range('B5').Text
    product = $reportSheet.Range('A6').Text
    address = $reportSheet.Range('B6').Text
    freezePanes = $excelApp.ActiveWindow.FreezePanes
    filter = $reportSheet.AutoFilterMode
  }
  if ($result.columns -ne 2 -or $result.rows -ne 8 -or $result.product -ne 'ITPFPHM510ESAI4' -or $result.address -ne 'R01A1C03DP02') { throw 'O Excel abriu, mas os dados diferem do cenário de aceitação.' }
  $reportSheet.ExportAsFixedFormat(0, [IO.Path]::GetFullPath($PdfPath))
  $result | ConvertTo-Json
} finally {
  if ($reportBook) { $reportBook.Close($false) }
  if ($excelApp) { $excelApp.Quit() }
  foreach ($object in @($reportSheet,$reportBook,$excelApp)) { if ($object) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($object) } }
}
