import { spawn } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';

function parseArguments(argv) {
    const options = { command: argv[0] ?? 'status' };
    for (let index = 1; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--server') options.server = argv[++index];
        else if (arg === '--tool') options.tool = argv[++index];
        else if (arg === '--thread') options.threadId = argv[++index];
        else if (arg === '--arguments') options.arguments = argv[++index];
        else throw new Error(`Unknown argument: ${arg}`);
    }
    return options;
}

function loadArguments(value) {
    if (!value) return {};
    if (value.startsWith('@')) return JSON.parse(fs.readFileSync(value.slice(1), 'utf8'));
    return JSON.parse(value);
}

class AppServerClient {
    constructor() {
        this.nextId = 1;
        this.pending = new Map();
        this.process = spawn('codex', ['app-server', '--stdio'], {
            stdio: ['pipe', 'pipe', 'inherit'],
            env: {
                ...process.env,
                RUST_LOG: process.env.RUST_LOG ?? 'error',
            },
        });
        this.lines = readline.createInterface({ input: this.process.stdout });
        this.lines.on('line', line => this.handleLine(line));
        this.process.once('exit', code => {
            const error = new Error(`Codex app server exited with code ${code}.`);
            for (const request of this.pending.values()) request.reject(error);
            this.pending.clear();
        });
    }

    handleLine(line) {
        let message;
        try {
            message = JSON.parse(line);
        } catch {
            return;
        }
        if (!Object.hasOwn(message, 'id')) return;
        const request = this.pending.get(String(message.id));
        if (!request) return;
        this.pending.delete(String(message.id));
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    }

    request(method, params) {
        const id = String(this.nextId++);
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
        });
    }

    async initialize() {
        return this.request('initialize', {
            clientInfo: {
                name: 'yomu-academy-honen-bridge',
                title: 'Yomu Academy Honen Bridge',
                version: '1.0.0',
            },
            capabilities: {
                experimentalApi: true,
                requestAttestation: false,
                mcpServerOpenaiFormElicitation: true,
            },
        });
    }

    close() {
        this.lines.close();
        this.process.stdin.end();
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const client = new AppServerClient();
    try {
        await client.initialize();
        let result;
        if (options.command === 'status') {
            result = await client.request('mcpServerStatus/list', {
                detail: 'full',
                limit: 100,
                threadId: options.threadId ?? null,
            });
            if (options.server) {
                result = {
                    ...result,
                    data: result.data.filter(server => server.name === options.server),
                };
            }
        } else if (options.command === 'call') {
            if (!options.server || !options.tool) {
                throw new Error('call requires --server and --tool.');
            }
            const threadId = options.threadId ?? (await client.request('thread/start', {
                cwd: process.cwd(),
                approvalPolicy: 'never',
                sandbox: 'danger-full-access',
                ephemeral: true,
                serviceName: 'yomu-academy-honen-bridge',
            })).thread.id;
            result = await client.request('mcpServer/tool/call', {
                threadId,
                server: options.server,
                tool: options.tool,
                arguments: loadArguments(options.arguments),
            });
        } else {
            throw new Error(`Unknown command: ${options.command}`);
        }
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally {
        client.close();
    }
}

main().catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
});
