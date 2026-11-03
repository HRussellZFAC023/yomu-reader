# 0035: Desktop selected text is an explicit action

Date: 3 November 2026. Status: implemented for the next desktop release.

## Context

The [28 August request](https://discord.com/channels/1505124636336328806/1505124637338501173/1542916092807086131) asks for a shortcut that looks up actual selected text in Word, PDFs, and other desktop apps. Those documents already contain text, so screenshot OCR adds recognition errors. This capability was never implemented in the old Gaming app.

## Decision

The desktop main process reads selection only after the learner invokes its distinct shortcut or its delayed tray action. It reads Windows UI Automation `TextPattern.GetSelection`, macOS `AXSelectedText`, or Linux X11 PRIMARY. It never synthesizes Copy, reads the ordinary clipboard as a selection fallback, or watches either clipboard. Unsupported providers and permissions produce a localized explanation and an explicit paste field. Wayland uses that field.

The native result is a typed text session, separate from frozen image captures. A session expires after 15 seconds, can be consumed once by its intended renderer, and is cancelled by a newer action or window close. The window URL carries only a session ID. The native handoff never writes selected content to preferences, diagnostics, or temporary files. The existing Reader uses the explicit lookup text with its configured dictionary services and usual outbound lookup links. At most 20,000 characters enter the renderer. Multiple disjoint Windows ranges are refused because joining them would invent source content.

Native shortcut preferences belong to the main process's `selected-text-shortcut-v1.json`, beside the existing capture-shortcut file. They are not `ReaderSettings` fields and do not pass through managed Reader settings or the settings-surface view intent. Desktop backups carry an optional, strictly validated `desktop.textLookupShortcut` object. Browser exports and older desktop backups omit that object and leave the native preference unchanged. Main-process tests verify persistence and reload independently of Reader normalization.

The focused app is sampled before Yomu changes focus. The direct shortcut starts disabled and suggests Ctrl/Cmd+Shift+L, with its own enable and registration status. A successful global registration cannot detect application-local conflicts such as Word's Ctrl+Shift+L bullet command, so an upgrade must not silently claim that key. The tray action stays available and waits three seconds for the learner to return to the source app. A compact native window displays the exact source text, and the packaged Reader's existing text lookup supplies cards, readings, meanings, and deck actions. Reader OCR remains disabled in this window. The screen OCR shortcut keeps its current behavior.

## Alternatives

Synthesizing Copy and restoring the clipboard can work in more apps, but restoring only plain text loses other clipboard formats. Clipboard managers and a user copying during the operation also make restoration unsafe. This implementation uses the explicit paste field when an app does not expose selection.

Reusing an OCR response with fabricated image geometry would blur the source boundary and couple text lookup to OCR settings. The text session has no image or recognition provider.

## Evidence and limits

`gaming-selected-text.test.ts` exercises native-command boundaries, exact whitespace, permission failures, unsupported platforms, cancellation, and expiry. `gaming-selected-text-renderer.test.ts` verifies exact text reaches lookup with OCR disabled and no capture or OCR calls. `scripts/manual/gaming-selected-text-proof.mjs` runs the packaged renderer and native Windows WPF selection fixture. Its Windows result does not prove Word/PDF vendor support, macOS permissions, Linux desktop behavior, or an OS-dispatched shortcut on another machine.

Run the physical proof after `npm run build:gaming:renderer` and `npm run build:gaming:main`, with `node scripts/manual/gaming-selected-text-proof.mjs`. The proof uses a temporary isolated profile and leaves labeled evidence under ignored `qa-artifacts/`.

Native API references: [Microsoft TextPattern.GetSelection](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getselection?view=windowsdesktop-9.0), [Apple AXSelectedText](https://developer.apple.com/documentation/applicationservices/kaxselectedtextattribute), and [Electron 38 clipboard selection](https://github.com/electron/electron/blob/v38.8.6/docs/api/clipboard.md).

Windows acceptance also exercised an actual new unsaved Microsoft Word 16.0.20527.20112 document containing `冒険を始めよう。 Chapter 1`. An OS-registered shortcut, dispatched through Computer Use, returned that exact mixed passage and opened the Reader token list with OCR disabled and zero feature clipboard/capture/OCR calls. Mouse selection opened the 冒険 card, and Escape retained the source. Enter reopened the phrase list, and Tab navigation plus Enter opened the same card with its reading, meaning, and deck controls. This proves the installed Word version on the test machine, not every Word/PDF provider. macOS and Linux remain command-boundary fixtures rather than physical proof.
