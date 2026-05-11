# Local Audio

よむ can use any Yomitan-compatible custom audio source. You can either use a hosted Ultimate Yomitan Audio URL, or run a local Rust audio server on your own computer and point よむ at it.

<div class="yomu-callout">
  <strong>Short version:</strong> run the server on your computer, copy a URL like <code>http://localhost:9393/?term={term}&amp;reading={reading}</code>, paste it into Settings &gt; Audio as a Custom URL JSON source, and save.
</div>

## Hosted Option

The easiest high-quality option is [Ultimate Yomitan Audio Source](https://animecards.site/yomitan_audio/). Its hosted setup gives you a personal URL after you subscribe through Patreon and authenticate. The hosted URL already works as a Yomitan-style JSON audio source, so there is no local server to keep running.

Use that hosted URL like this:

1. Open よむ settings with the floating よむ button or `Alt+Shift+J`.
2. Go to Audio.
3. Press Add audio source.
4. Set Type to Custom URL JSON.
5. Paste the personal URL you were given.
6. Save and test a lookup.

This is the most convenient route if you want good TTS fallback and do not want to manage audio files yourself.

## Self-Hosted Option

If you want everything local, run the Rust server from our fork:

[HRussellZFAC023/yomichan_audio_server](https://github.com/HRussellZFAC023/yomichan_audio_server)

The original server is [aramrw/yomichan_audio_server](https://github.com/aramrw/yomichan_audio_server). We use our fork because large local audio folders should answer quickly, and the caching/lookup improvements used here were not merged upstream.

The server expects one `audio` folder with source folders inside it:

```text
yomitan-audio/
├── audio/
│   ├── daijisen/media/
│   ├── jpod/media/
│   ├── nhk16/media/
│   ├── shinmeikai8/media/
│   ├── forvo_jp/
│   └── forvo_zh/
└── yomichan_audio_server
```

If you downloaded audio from Ultimate Yomitan Audio or from the upstream release assets, keep the source folder names the same and point the server at the parent `audio` folder.

## Pick a Port

The original server defaults to `8080`, but many local development tools also use `localhost:8080`. Use a quieter port such as `9393`:

```bash
yomichan_audio_server --port 9393 --audio ./audio --log full
```

On Windows, the same idea looks like:

```powershell
.\yomichan_audio_server.exe --port 9393 --audio .\audio --log full
```

The URL you paste into よむ must use the same port:

```text
http://localhost:9393/?term={term}&reading={reading}
```

Test it in your browser before adding it to よむ:

```text
http://localhost:9393/?term=猫&reading=ねこ
```

You should see JSON with `audioSources`.

## Paste the URL Into よむ

1. Open a page where よむ is running.
2. Open settings with the floating よむ button or `Alt+Shift+J`.
3. Open the Audio section.
4. Make sure Enable audio playback for terms is on.
5. Press Add audio source.
6. Set Type to Custom URL JSON.
7. Paste:

```text
http://localhost:9393/?term={term}&reading={reading}
```

8. Move the source above the built-in sources if you want local audio tried first.
9. Save settings.
10. Look up a word and press the speaker button.

`{term}` and `{reading}` are placeholders. Leave them exactly like that; よむ replaces them for each word.

## Run on Startup

Use full paths in startup commands so the server can find the binary and audio folder after a reboot.

### Windows

Create a file named `start-yomu-audio.cmd` next to the server:

```bat
@echo off
cd /d "C:\Tools\yomitan-audio"
"C:\Tools\yomitan-audio\yomichan_audio_server.exe" --port 9393 --audio "C:\Tools\yomitan-audio\audio" --log headless
```

If you downloaded an upstream binary named `yas-x86_64-pc-windows.exe`, use that filename instead of `yomichan_audio_server.exe`.

Register it to start when you log in:

```powershell
schtasks /Create /TN "Yomu Local Audio" /SC ONLOGON /TR "`"C:\Tools\yomitan-audio\start-yomu-audio.cmd`"" /F
```

Start it once without rebooting:

```powershell
schtasks /Run /TN "Yomu Local Audio"
```

Remove it later:

```powershell
schtasks /Delete /TN "Yomu Local Audio" /F
```

### macOS

Put the server somewhere stable, for example:

```text
/Users/you/Tools/yomitan-audio/yomichan_audio_server
```

Create `~/Library/LaunchAgents/com.yomu.audio-server.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yomu.audio-server</string>
  <key>WorkingDirectory</key>
  <string>/Users/you/Tools/yomitan-audio</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/you/Tools/yomitan-audio/yomichan_audio_server</string>
    <string>--port</string>
    <string>9393</string>
    <string>--audio</string>
    <string>/Users/you/Tools/yomitan-audio/audio</string>
    <string>--log</string>
    <string>headless-instance</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/yomu-audio.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/yomu-audio.err</string>
</dict>
</plist>
```

Load it:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yomu.audio-server.plist
launchctl enable gui/$(id -u)/com.yomu.audio-server
```

Restart it after editing the plist:

```bash
launchctl kickstart -k gui/$(id -u)/com.yomu.audio-server
```

Remove it later:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.yomu.audio-server.plist
```

## Use It on iPad or Another Device

`localhost` always means the device you are currently using. On your PC or Mac, `localhost:9393` means the computer running the audio server. On your iPad, `localhost:9393` means the iPad itself, so it will not reach the computer.

[Tailscale](https://tailscale.com/downloads) solves this by putting your computer, phone, and tablet on one private network. You run the audio server on one always-on computer, then other signed-in devices can reach it.

Set it up like this:

1. Install Tailscale on the computer running the audio server.
2. Install Tailscale on your iPad, phone, or second computer.
3. Sign in with the same account on every device.
4. Keep Tailscale connected on those devices.
5. Leave the audio-server computer awake.

Because this Rust server binds to `localhost`, use Tailscale Serve on the computer:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:9393
tailscale serve status
```

`tailscale serve status` prints the private tailnet URL. It usually looks like this:

```text
https://desktop.your-tailnet.ts.net
```

Use that base URL in よむ:

```text
https://desktop.your-tailnet.ts.net/?term={term}&reading={reading}
```

Paste that Tailscale URL into Settings > Audio > Custom URL JSON on every device that should use the computer's audio server.

Tailscale Serve keeps the service private to your tailnet. You do not need Tailscale Funnel for this, because Funnel exposes services to the public internet.

## Troubleshooting

- If nothing responds locally, make sure the server is still running and that the URL port matches `--port`.
- If another app uses `8080`, restart the server with `--port 9393` and update the URL in よむ.
- If the server responds but no audio plays, check the `audio` folder layout and source folder names.
- If iPad playback fails, make sure Tailscale is connected on both devices and that you pasted the `https://desktop.your-tailnet.ts.net/?term={term}&reading={reading}` URL, not `localhost`.
- If source builds fail, download `entries.db` into the server repo root before running `cargo build --release`.
