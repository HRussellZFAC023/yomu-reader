import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';
import { academyCookieForRemote, academySetCookieForLocal } from './academy-cookie-proxy';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function remoteAcademyProxy(): ProxyOptions {
    return {
        target: 'https://yomureader.com',
        changeOrigin: true,
        // The Worker intentionally rejects mutating cross-origin requests.
        // This proxy is the local same-site test boundary, so present its
        // upstream leg as the production origin rather than 127.0.0.1.
        headers: {
            origin: 'https://yomureader.com',
            'sec-fetch-site': 'same-origin',
        },
        configure(proxy) {
            proxy.on('proxyRes', response => {
                const setCookie = response.headers['set-cookie'];
                if (setCookie) response.headers['set-cookie'] = setCookie.map(academySetCookieForLocal);
            });
            proxy.on('proxyReq', (request, incoming) => {
                const cookie = incoming.headers.cookie;
                if (cookie) request.setHeader('cookie', academyCookieForRemote(cookie));
            });
        },
    };
}

function academyRootRedirect(): Plugin {
    const redirect = (request: IncomingMessage, response: ServerResponse, next: () => void): void => {
        const pathname = new URL(request.url ?? '/', 'http://academy.local').pathname;
        if (pathname !== '/') {
            next();
            return;
        }
        response.statusCode = 302;
        response.setHeader('location', '/academy/');
        response.end();
    };
    return {
        name: 'academy-root-redirect',
        configureServer(server) {
            server.middlewares.use(redirect);
        },
        configurePreviewServer(server) {
            server.middlewares.use(redirect);
        },
    };
}

export default defineConfig(({ command }) => ({
    plugins: [academyRootRedirect()],
    // Dev serves the same hosted Reader + Academy tree as GitHub Pages so the
    // real annotation runtime is exercised during browser acceptance.
    publicDir: command === 'serve' ? path.join(root, 'docs/public') : false,
    server: {
        host: '127.0.0.1',
        port: Number(process.env.ACADEMY_PORT ?? 5174),
        strictPort: true,
        // Local Academy acceptance uses the deployed access/media boundary so
        // HttpOnly invite sessions and protected range audio behave exactly
        // as they do on the hosted origin. Build output is unaffected.
        proxy: {
            '/academy/api': remoteAcademyProxy(),
            '/academy/media': remoteAcademyProxy(),
        },
    },
    build: {
        outDir: path.join(root, 'dist/academy'),
        emptyOutDir: true,
        target: 'es2022',
        minify: false,
        cssMinify: false,
        lib: {
            entry: path.join(root, 'src/academy/entrypoint.ts'),
            name: 'YomuAcademy',
            formats: ['iife'],
            fileName: () => 'app.js',
        },
    },
    test: {
        environment: 'jsdom',
        include: ['tests/academy/**/*.test.ts'],
        globals: true,
        pool: 'forks',
        poolOptions: { forks: { minForks: 1, maxForks: 4 } },
    },
}));
