#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import process from 'node:process';

const preferredPort = Number(process.env.PORT || 5174);
const viteBin = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const localHostPattern = /http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//i;
const ansiPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const signalExitCode = { SIGINT: 130, SIGTERM: 143 };

let publishedPort = null;
let publishPromise = null;
let cleanupPromise = null;
let shuttingDown = false;

function execFileText(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                reject(error);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

function stripAnsi(value) {
    return value.replace(ansiPattern, '');
}

function firstLine(value) {
    return String(value || '').trim().split(/\r?\n/).find(Boolean) || '';
}

async function getTailscaleAddress() {
    const [ipOutput, statusOutput] = await Promise.all([
        execFileText('tailscale', ['ip', '-4']),
        execFileText('tailscale', ['status', '--json']).catch(() => ''),
    ]);
    const ip = firstTailscaleIp(ipOutput);
    const dnsName = tailscaleDnsName(statusOutput);

    if (!ip) throw new Error('tailscale did not return an IPv4 address');
    return { ip, dnsName };
}

function firstTailscaleIp(output) {
    return output.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
}

function tailscaleDnsName(statusOutput) {
    if (!statusOutput) return '';
    try {
        return JSON.parse(statusOutput).Self?.DNSName?.replace(/\.$/, '') || '';
    } catch {
        return '';
    }
}

async function publishToTailnet(port) {
    console.log(`\n[dev:ipad] Publishing local Vite port ${port} through Tailscale Serve...`);
    const { ip, dnsName } = await getTailscaleAddress();
    await execFileText('tailscale', ['serve', '--bg', `--tcp=${port}`, `tcp://127.0.0.1:${port}`]);
    publishedPort = port;

    console.log('[dev:ipad] iPad links:');
    console.log(`  App:    http://${ip}:${port}/`);
    console.log(`  Newtab: http://${ip}:${port}/newtab/`);
    if (dnsName) {
        console.log(`  DNS:    http://${dnsName}:${port}/`);
    }
    console.log('[dev:ipad] Use the root URL locally; /yomu-reader/ is the production GitHub Pages path.\n');
}

function maybePublish(chunk) {
    if (publishPromise) return;
    const text = stripAnsi(chunk.toString());
    const match = text.match(localHostPattern);
    if (!match) return;

    const port = Number(match[1]);
    if (!Number.isFinite(port)) return;

    publishPromise = publishToTailnet(port).catch(error => {
        const detail = commandErrorSummary(error);
        console.error(`[dev:ipad] Could not publish through Tailscale Serve: ${detail}`);
        console.error('[dev:ipad] Vite is still running locally. Check that Tailscale is running, then retry.');
    });
}

async function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = runCleanup();
    return cleanupPromise;
}

async function runCleanup() {
    await waitForPublishAttempt();
    if (!publishedPort) return;
    await removePublishedTailnetPort(publishedPort);
}

async function waitForPublishAttempt() {
    if (publishPromise) await publishPromise.catch(() => {});
}

async function removePublishedTailnetPort(port) {
    try {
        await execFileText('tailscale', ['serve', `--tcp=${port}`, 'off']);
        console.log(`[dev:ipad] Removed Tailscale proxy for port ${port}.`);
    } catch (error) {
        const detail = commandErrorSummary(error);
        console.error(`[dev:ipad] Could not remove Tailscale proxy for port ${port}: ${detail}`);
        console.error(`[dev:ipad] You can remove it manually with: tailscale serve --tcp=${port} off`);
    }
}

function commandErrorSummary(error) {
    return firstLine(error.stderr) || firstLine(error.stdout) || error.message;
}

const vite = spawn(viteBin, ['--host', '127.0.0.1', '--port', String(preferredPort)], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
});

vite.stdout.on('data', chunk => {
    process.stdout.write(chunk);
    maybePublish(chunk);
});

vite.stderr.on('data', chunk => {
    process.stderr.write(chunk);
    maybePublish(chunk);
});

vite.on('error', async error => {
    console.error(`[dev:ipad] Could not start Vite: ${error.message}`);
    await cleanup();
    process.exit(1);
});

vite.on('exit', async (code, signal) => {
    await cleanup();
    process.exit(viteExitCode(code, signal));
});

function viteExitCode(code, signal) {
    if (isShutdownSignal(signal)) return signalExitStatus(signal);
    return code ?? 1;
}

function isShutdownSignal(signal) {
    return Boolean(signal && shuttingDown);
}

function signalExitStatus(signal) {
    return signalExitCode[signal] || 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        if (shuttingDown) return;
        shuttingDown = true;
        vite.kill(signal);
    });
}
