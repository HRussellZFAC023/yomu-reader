import { execFile } from 'node:child_process';
import type { YomuGamingSelectedText } from './ipc';

const SELECTED_TEXT_LIMIT = 20_000;

// Only the focused control and its ancestors are queried. Never read ValuePattern,
// document text, passwords, the normal clipboard, or synthesize a Copy keystroke.
const WINDOWS_SELECTION_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
try {
    $element = [System.Windows.Automation.AutomationElement]::FocusedElement
    for ($depth = 0; $element -and $depth -lt 8; $depth++) {
        if ($element.Current.IsPassword) { Write-Output '{"kind":"unavailable"}'; exit }
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
            $ranges = $pattern.GetSelection()
            $parts = @($ranges | ForEach-Object { $_.GetText(20001) })
            if ($parts.Count -gt 1) { Write-Output '{"kind":"unavailable"}'; exit }
            $text = $parts -join ''
            @{ kind = 'text'; text = $text } | ConvertTo-Json -Compress
            exit
        }
        $element = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($element)
    }
    Write-Output '{"kind":"unavailable"}'
} catch [System.UnauthorizedAccessException] {
    Write-Output '{"kind":"permission"}'
} catch {
    Write-Output '{"kind":"unavailable"}'
}
`;

const MAC_SELECTION_SCRIPT = String.raw`
tell application "System Events"
    tell first application process whose frontmost is true
        set focusedElement to value of attribute "AXFocusedUIElement"
        set roleName to value of attribute "AXRole" of focusedElement
        if roleName is "AXSecureTextField" then error number -25203
        if exists attribute "AXSubrole" of focusedElement then
            if value of attribute "AXSubrole" of focusedElement is "AXSecureTextField" then error number -25203
        end if
        return value of attribute "AXSelectedText" of focusedElement
    end tell
end tell
`;

interface SelectionCommand {
    file: string;
    args: string[];
}

export interface SelectedTextHost {
    platform: string;
    displayServer: string;
    run(command: SelectionCommand): Promise<string>;
    readPrimarySelection(): string;
}

class SelectionAccessError extends Error {
    constructor(readonly kind: 'permission' | 'unavailable') { super('Selection access failed.'); }
}

export async function readSelectedText(host: SelectedTextHost): Promise<YomuGamingSelectedText> {
    try {
        switch (host.platform) {
            case 'win32': {
                const output = await host.run({ file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
                    Buffer.from(WINDOWS_SELECTION_SCRIPT, 'utf16le').toString('base64')] });
                return parseWindowsSelectedText(output);
            }
            case 'darwin': {
                const output = await host.run({ file: '/usr/bin/osascript', args: ['-e', MAC_SELECTION_SCRIPT] });
                // osascript adds exactly one output newline, outside the AX value.
                return selectedTextResult(output.replace(/\r?\n$/, ''));
            }
            case 'linux':
                return host.displayServer === 'x11' ? selectedTextResult(host.readPrimarySelection()) : { kind: 'unsupported' };
            default:
                return { kind: 'unsupported' };
        }
    } catch (error) {
        return { kind: error instanceof SelectionAccessError ? error.kind : 'unavailable' };
    }
}

export function selectedTextResult(text: string): YomuGamingSelectedText {
    if (!text.trim()) return { kind: 'empty' };
    if (text.length > SELECTED_TEXT_LIMIT) return { kind: 'too-long' };
    return { kind: 'text', text };
}

function parseWindowsSelectedText(output: string): YomuGamingSelectedText {
    const parsed: unknown = JSON.parse(output.replace(/^\uFEFF/, ''));
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return { kind: 'unavailable' };
    if (parsed.kind === 'text' && 'text' in parsed && typeof parsed.text === 'string') return selectedTextResult(parsed.text);
    if (parsed.kind === 'permission') return { kind: 'permission' };
    return { kind: 'unavailable' };
}

export function runSelectionCommand(command: SelectionCommand): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(command.file, command.args, { windowsHide: true, timeout: 5_000, maxBuffer: 256_000, encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                // Classify here and discard both streams. Errors never carry another
                // app's stdout/stderr into the renderer, a log, or a caller's catch.
                const permission = /-1743|-1719|-25211|assistive access|not authorized/i.test(stderr);
                reject(new SelectionAccessError(permission ? 'permission' : 'unavailable'));
            } else resolve(stdout);
        });
    });
}

/** A native result lives only until its intended document consumes it. */
export class SelectedTextSession {
    private generation = 0;
    private pending: { id: number; result: YomuGamingSelectedText; expires: number } | null = null;
    private expiryTimer: ReturnType<typeof setTimeout> | undefined;

    cancel(): void {
        this.generation++;
        this.pending = null;
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        this.expiryTimer = undefined;
    }

    async capture(read: () => Promise<YomuGamingSelectedText>): Promise<number | null> {
        this.cancel();
        const id = this.generation;
        const result = await read();
        if (id !== this.generation) return null;
        this.pending = { id, result, expires: Date.now() + 15_000 };
        this.expiryTimer = setTimeout(() => { this.pending = null; this.expiryTimer = undefined; }, 15_000);
        this.expiryTimer.unref?.();
        return id;
    }

    take(id: unknown): YomuGamingSelectedText {
        const pending = this.pending;
        if (!pending || pending.id !== id || pending.expires < Date.now()) return { kind: 'expired' };
        this.pending = null;
        if (this.expiryTimer) clearTimeout(this.expiryTimer);
        this.expiryTimer = undefined;
        return pending.result;
    }
}
