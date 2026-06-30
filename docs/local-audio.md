---
title: Local Audio
description: Add Japanese word audio to よむ. Use a hosted Yomitan-compatible audio URL for the easiest setup, or run a free local audio server to play pronunciation files stored on your own computer.
---

# Local Audio

よむ can play audio from any Yomitan-compatible audio source. There are two good ways to set it up:

| What you want | Best choice |
| --- | --- |
| The easiest setup | Use the built-in Yomu hosted audio source or a hosted Ultimate Yomitan Audio URL |
| Audio files stored on your own computer | Download and run the local audio server |

The hosted option is the least fuss. Use the local server only if you're okay keeping a small helper app running on your computer.

## Yomu Hosted Audio

Yomu includes this Yomitan-compatible source first in the default audio list:

```text
https://audio.yomureader.com/?term={term}&reading={reading}
```

It is designed for licensed recorded audio and returns an empty result quickly when the public source is paused or still being filled. That keeps the rest of your configured sources working normally.

## Easiest: Hosted Audio

[Ultimate Yomitan Audio Source](https://animecards.site/yomitan_audio/) gives you a personal audio URL after you subscribe through Patreon and authenticate. That URL works with よむ directly — no audio files to download and nothing to run on your computer.

Add it to よむ:

1. Open よむ settings with the floating よむ button or `Alt+Shift+J`.
2. Go to Audio.
3. Press Add audio source.
4. Set Type to Custom URL.
5. Paste the personal URL you were given.
6. Save, look up a word, and press the speaker button.

## Cloudflare Hosting Status

よむ has a Cloudflare Worker for `audio.yomureader.com`. It can serve a licensed R2-backed audio manifest, or proxy a private upstream we are allowed to redistribute.

The safe deployment plan is:

1. Confirm the audio source license allows public redistribution or provide a private upstream URL/token.
2. Export a manifest from the local audio server with `npm run audio:export -- --words ./audio-seed.tsv --out tmp/yomu-audio-export`.
3. Store only licensed audio in the `yomu-audio` Cloudflare R2 bucket, or proxy only a private, authenticated upstream.
4. Put the Worker in front of the bucket/upstream. It accepts `term` and `reading`, returns Yomitan-compatible JSON, serves `/audio/...` files with CORS, and falls through cleanly when no match exists.

Cost-wise, the public default remains cautious: when the public source is empty or paused, よむ immediately falls through to the next audio source. Workers Free is limited to 100,000 requests per day and R2's free tier is limited to 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations per month. A public pronunciation source can exceed request limits long before it looks large, and a full audio corpus may exceed free storage. See Cloudflare's current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/) before deploying.

## Local Audio: What You Need

Local audio means よむ asks a helper app on your computer for the sound file.

You need:

1. A computer that stays awake while you study.
2. The audio files.
3. The local audio server download.

The server download is here:

[Yomichan/Yomitan Audio Server releases](https://github.com/HRussellZFAC023/yomichan_audio_server/releases/latest)

Don't use the green Code button on GitHub — that downloads developer source code. Take the latest file from the Releases page.

## Step 1: Download the Server

Open the release page and download the file that matches your computer:

| Computer | File to download |
| --- | --- |
| Windows | the file ending in `windows-x86_64.zip` |
| Apple Silicon Mac | the file ending in `macos-aarch64.tar.gz` |
| Intel Mac | the file ending in `macos-x86_64.tar.gz` |
| Linux | the file ending in `linux-x86_64.tar.gz` |

Unzip or open the download. Put the extracted folder somewhere easy to find, such as your Desktop, and rename it to `yomu-audio`.

Inside that folder you should see a server file named either:

```text
yomichan_audio_server
```

or, on Windows:

```text
yomichan_audio_server.exe
```

## Step 2: Add the Audio Files

Download the audio files:

[nyaa.si/view/1957972](https://nyaa.si/view/1957972)

Create a folder named `audio` inside your `yomu-audio` folder. Put the downloaded audio source folders inside it.

The folder should look like this:

```text
yomu-audio/
├── audio/
│   ├── daijisen/media/
│   ├── jpod/media/
│   ├── nhk16/media/
│   ├── shinmeikai8/media/
│   ├── forvo_jp/
│   └── forvo_zh/
└── yomichan_audio_server
```

On Windows, the server file will usually be `yomichan_audio_server.exe`.

Keep the audio folder names the same. For example, do not rename `forvo_jp` or `nhk16`.

## Step 3: Start the Server

The server must stay open while you use local audio. If you close the Terminal or PowerShell window, local audio stops until you start it again.

Use port `9393`. That avoids a common conflict with other local apps.

### Windows

1. Open the `yomu-audio` folder in File Explorer.
2. Right-click an empty space in the folder.
3. Choose Open in Terminal or Open PowerShell window here.
4. Paste this command and press Enter:

```powershell
.\yomichan_audio_server.exe --port 9393 --audio .\audio --log full
```

### macOS or Linux

1. Open Terminal.
2. Type `cd `, including the space after `cd`.
3. Drag your `yomu-audio` folder into Terminal.
4. Press Enter.
5. Paste these commands and press Enter:

```bash
chmod +x ./yomichan_audio_server
./yomichan_audio_server --port 9393 --audio ./audio --log full
```

If macOS blocks the app, open System Settings > Privacy & Security and allow it, or Control-click the server file in Finder and choose Open.

## Step 4: Check That It Works

Leave the server window open. Open this test link in your browser:

```text
http://localhost:9393/?term=猫&reading=ねこ
```

If it works, the browser shows a plain text response that includes `audioSources`. That means the server is running and よむ can use it.

If the browser says the page cannot be reached, the server is not running, the window was closed, or the command used a different port.

## Step 5: Add It to よむ

1. Open a page where よむ is running.
2. Open settings with the floating よむ button or `Alt+Shift+J`.
3. Open Audio.
4. Turn on Enable audio playback for terms.
5. Press Add audio source.
6. Set Type to Custom URL.
7. Paste this exact URL:

```text
http://localhost:9393/?term={term}&reading={reading}
```

8. Move the local audio source above the built-in sources if you want local audio tried first.
9. Save settings.
10. Look up a word and press the speaker button.

Leave `{term}` and `{reading}` exactly as written. よむ replaces those placeholders for each word you look up.

Jiten/JPDB and browser text-to-speech rows are fallback-only by default, so **Shuffle audio** still prefers recorded clips first. Shuffle mode behaves like a shuffled deck: よむ tries every available candidate for a word before reshuffling, instead of independently picking a random clip each time. In Settings > Audio, change **Text-to-speech handling** to **Follow source order / shuffle** if you want TTS rows to follow your source order or shuffled audio setting.

## Using an iPad or Another Device

On a phone or iPad, `localhost:9393` means *that device*, not the computer running the server (see [desktop helpers on mobile](/getting-started)). To reach your computer's audio server from another device, use [Tailscale](https://tailscale.com/downloads).

Basic setup:

1. Install Tailscale on the computer running the audio server.
2. Install Tailscale on the iPad, phone, or other computer.
3. Sign in with the same Tailscale account on every device.
4. Keep Tailscale connected.
5. Leave the audio-server computer awake.

On the computer running the audio server, run:

```bash
tailscale serve --bg --https=443 http://127.0.0.1:9393
tailscale serve status
```

`tailscale serve status` prints a private Tailscale URL that looks like this:

```text
https://desktop.your-tailnet.ts.net
```

Use that URL in よむ on the other device:

```text
https://desktop.your-tailnet.ts.net/?term={term}&reading={reading}
```

Tailscale Serve keeps the server private to your own Tailscale account. You do not need Tailscale Funnel.

## If Audio Does Not Play

- Make sure the server window is still open.
- Make sure the URL in よむ uses `9393`.
- Make sure the audio folders are inside `yomu-audio/audio/`.
- Make sure the audio folder names were not changed.
- If the browser test does not load, start the server again.
- If iPad playback fails, use the Tailscale URL, not `localhost`.
- If this setup feels like too much, use the [hosted audio option](#easiest-hosted-audio) at the top of this page.
