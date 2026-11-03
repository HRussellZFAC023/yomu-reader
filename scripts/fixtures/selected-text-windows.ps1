param([Parameter(Mandatory=$true)][string]$ReadyPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SelectionFixtureFocus {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr processId);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint current, uint foreground, bool attach);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
$window = New-Object System.Windows.Window
$window.Title = 'Yomu native selection fixture (test data)'
$window.Width = 560
$window.Height = 240
$window.Topmost = $true
$text = New-Object System.Windows.Controls.TextBox
$text.Text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5YaS6Zm6'))
$text.FontSize = 32
$text.Margin = '24'
$text.AcceptsReturn = $true
$window.Content = $text
$window.Add_ContentRendered({
    $current = [SelectionFixtureFocus]::GetCurrentThreadId()
    $foreground = [SelectionFixtureFocus]::GetWindowThreadProcessId([SelectionFixtureFocus]::GetForegroundWindow(), [IntPtr]::Zero)
    [SelectionFixtureFocus]::AttachThreadInput($current, $foreground, $true) | Out-Null
    try {
        $handle = [System.Windows.Interop.WindowInteropHelper]::new($window).Handle
        [SelectionFixtureFocus]::SetForegroundWindow($handle) | Out-Null
        $window.Activate() | Out-Null
        $text.Focus() | Out-Null
        $text.SelectAll()
    } finally {
        [SelectionFixtureFocus]::AttachThreadInput($current, $foreground, $false) | Out-Null
    }
    [IO.File]::WriteAllText($ReadyPath, 'ready')
})
$window.ShowDialog() | Out-Null
