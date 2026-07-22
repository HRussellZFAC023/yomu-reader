<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

type ServiceId = 'academy' | 'audio' | 'support' | 'edge';

interface ApiService {
    id: ServiceId;
    label: string;
}

interface SwaggerWindow extends Window {
    SwaggerUIBundle?: SwaggerFactory;
}

interface SwaggerFactory {
    (options: Record<string, unknown>): { destroy?: () => void };
    presets: { apis: unknown };
}

const services: ApiService[] = [
    { id: 'academy', label: 'Academy API' },
    { id: 'audio', label: 'Audio API' },
    { id: 'support', label: 'Support API' },
    { id: 'edge', label: 'Edge API' },
];

const selectedService = ref<ServiceId>('academy');
const swaggerRoot = ref<HTMLElement>();
const isLoading = ref(true);
const loadError = ref('');
let swaggerUi: { destroy?: () => void } | undefined;

const currentService = computed(() => (
    services.find(service => service.id === selectedService.value) ?? services[0]
));
const jsonUrl = computed(() => `/api/${currentService.value.id}.openapi.json`);
const yamlUrl = computed(() => `/api/${currentService.value.id}.openapi.yaml`);

function loadStyle(id: string, href: string): void {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
}

function loadScript(id: string, src: string): Promise<void> {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLScriptElement) {
        if (existing.dataset.loaded === 'true') return Promise.resolve();
        return new Promise((resolve, reject) => {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = false;
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
        document.head.append(script);
    });
}

async function ensureSwagger(): Promise<SwaggerFactory> {
    loadStyle('yomu-swagger-ui-style', '/api/vendor/swagger-ui.5.32.11.css');
    await loadScript('yomu-swagger-ui-bundle', '/api/vendor/swagger-ui-bundle.5.32.11.js');
    const factory = (window as SwaggerWindow).SwaggerUIBundle;
    if (!factory) throw new Error('Swagger UI did not initialize.');
    return factory;
}

async function renderSpecification(): Promise<void> {
    isLoading.value = true;
    loadError.value = '';
    await nextTick();
    try {
        const factory = await ensureSwagger();
        swaggerUi?.destroy?.();
        if (!swaggerRoot.value) return;
        swaggerRoot.value.replaceChildren();
        swaggerUi = factory({
            domNode: swaggerRoot.value,
            url: jsonUrl.value,
            deepLinking: true,
            displayOperationId: false,
            displayRequestDuration: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 2,
            filter: true,
            persistAuthorization: false,
            showExtensions: true,
            showCommonExtensions: true,
            tryItOutEnabled: false,
            withCredentials: true,
            syntaxHighlight: { activate: true, theme: 'nord' },
            presets: [factory.presets.apis],
            layout: 'BaseLayout',
        });
    } catch (error) {
        loadError.value = error instanceof Error ? error.message : 'Unable to load the API reference.';
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    void renderSpecification();
});

onBeforeUnmount(() => {
    swaggerUi?.destroy?.();
});
</script>

<template>
    <main class="yomu-api-reference" data-jpdb-reader-surface-ignore="true">
        <header class="yomu-api-toolbar">
            <h1 class="yomu-visually-hidden">Yomu API reference</h1>
            <div class="yomu-api-controls">
                <label>
                    <span>Contract</span>
                    <select v-model="selectedService" @change="renderSpecification">
                        <option v-for="service in services" :key="service.id" :value="service.id">
                            {{ service.label }}
                        </option>
                    </select>
                </label>
                <a :href="jsonUrl" download>JSON</a>
                <a :href="yamlUrl" download>YAML</a>
            </div>
        </header>

        <p v-if="isLoading" class="yomu-api-status" role="status">Loading specification...</p>
        <p v-if="loadError" class="yomu-api-status yomu-api-status--error" role="alert">{{ loadError }}</p>
        <div ref="swaggerRoot" class="yomu-api-spec" :aria-busy="isLoading"></div>
    </main>
</template>

<style scoped>
.yomu-api-reference {
    width: min(100%, 1480px);
    margin: 0 auto;
    padding: 36px clamp(18px, 4vw, 56px) 80px;
    color: var(--vp-c-text-1);
}

.yomu-api-toolbar {
    display: flex;
    align-items: end;
    justify-content: flex-end;
    gap: 24px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--vp-c-divider);
}

.yomu-api-toolbar h1 {
    margin: 0;
    color: var(--vp-c-text-1);
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 760;
    line-height: 1.08;
    letter-spacing: 0;
}

.yomu-visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.yomu-api-controls {
    display: flex;
    align-items: end;
    gap: 10px;
}

.yomu-api-controls label {
    display: grid;
    gap: 5px;
}

.yomu-api-controls label span {
    color: var(--vp-c-text-2);
    font-size: 12px;
    font-weight: 700;
}

.yomu-api-controls select,
.yomu-api-controls a {
    min-height: 40px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 6px;
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    font: 650 14px/1 var(--vp-font-family-base);
}

.yomu-api-controls select {
    min-width: 180px;
    padding: 0 34px 0 12px;
}

.yomu-api-controls a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 13px;
    color: var(--vp-c-brand-1);
    text-decoration: none;
}

.yomu-api-controls select:hover,
.yomu-api-controls select:focus-visible,
.yomu-api-controls a:hover,
.yomu-api-controls a:focus-visible {
    border-color: var(--vp-c-brand-1);
    outline: none;
}

.yomu-api-controls select:focus-visible,
.yomu-api-controls a:focus-visible {
    box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.yomu-api-status {
    margin: 40px 0 0;
    color: var(--vp-c-text-2);
}

.yomu-api-status--error {
    color: #b42318;
}

.yomu-api-spec {
    min-height: 65vh;
    padding-top: 18px;
}

:deep(.swagger-ui) {
    color: var(--vp-c-text-1);
    font-family: var(--vp-font-family-base);
}

:deep(.swagger-ui .wrapper) {
    max-width: none;
    padding: 0;
}

:deep(.swagger-ui .information-container) {
    padding: 0;
}

:deep(.swagger-ui .info) {
    margin: 24px 0 30px;
}

:deep(.swagger-ui .info .title) {
    margin: 0 0 8px;
    color: var(--vp-c-text-1);
    font-family: var(--vp-font-family-base);
    font-size: clamp(24px, 3vw, 34px);
    font-weight: 720;
    letter-spacing: 0;
}

:deep(.swagger-ui .info .title small) {
    top: -3px;
    border-radius: 4px;
    background: var(--vp-c-bg-soft);
}

:deep(.swagger-ui .info .title small pre) {
    color: var(--vp-c-text-2);
}

:deep(.swagger-ui .info .title .version-stamp) {
    background: var(--vp-c-brand-1);
}

:deep(.swagger-ui .info .title .version-stamp pre) {
    color: var(--yomu-brand-ink, var(--yomu-doc-brand-ink));
}

:deep(.swagger-ui .info p),
:deep(.swagger-ui .info li),
:deep(.swagger-ui .info table),
:deep(.swagger-ui .info .base-url) {
    color: var(--vp-c-text-2);
}

:deep(.swagger-ui .info a) {
    color: var(--vp-c-brand-1);
}

:deep(.swagger-ui .scheme-container) {
    margin: 0 0 22px;
    padding: 14px 16px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 6px;
    background: var(--vp-c-bg-soft);
    box-shadow: none;
}

:deep(.swagger-ui .opblock-tag) {
    border-bottom-color: var(--vp-c-divider);
    color: var(--vp-c-text-1);
    font-family: var(--vp-font-family-base);
}

:deep(.swagger-ui .opblock-tag small) {
    color: var(--vp-c-text-2);
}

:deep(.swagger-ui .opblock) {
    margin: 0 0 8px;
    border-radius: 6px;
    box-shadow: none;
}

:deep(.swagger-ui .opblock .opblock-summary-method),
:deep(.swagger-ui .opblock .opblock-summary-path) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

:deep(.swagger-ui .opblock .opblock-summary-method) {
    border-radius: 4px;
}

:deep(.swagger-ui .opblock .opblock-summary-description) {
    color: var(--vp-c-text-2);
}

:deep(.swagger-ui .btn),
:deep(.swagger-ui select),
:deep(.swagger-ui input[type="text"]),
:deep(.swagger-ui textarea) {
    min-height: 40px;
    border-radius: 6px;
    font-family: var(--vp-font-family-base);
}

:deep(.swagger-ui .models) {
    border-color: var(--vp-c-divider);
    border-radius: 6px;
}

:deep(.swagger-ui .models h4),
:deep(.swagger-ui .model-title),
:deep(.swagger-ui .model) {
    color: var(--vp-c-text-1);
}

:deep(.swagger-ui .model-box) {
    border-radius: 4px;
    background: var(--vp-c-bg-soft);
}

:global(.dark .yomu-api-reference .swagger-ui input[type="text"]),
:global(.dark .yomu-api-reference .swagger-ui select),
:global(.dark .yomu-api-reference .swagger-ui textarea) {
    border-color: var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
    color: var(--vp-c-text-1);
}

:global(.dark .yomu-api-reference .swagger-ui input::placeholder) {
    color: var(--vp-c-text-2);
}

:global(.dark .yomu-api-reference .swagger-ui .opblock .opblock-summary-path),
:global(.dark .yomu-api-reference .swagger-ui .opblock .opblock-summary-path__deprecated),
:global(.dark .yomu-api-reference .swagger-ui .opblock .opblock-summary-description),
:global(.dark .yomu-api-reference .swagger-ui .opblock-description-wrapper p),
:global(.dark .yomu-api-reference .swagger-ui .opblock-external-docs-wrapper p),
:global(.dark .yomu-api-reference .swagger-ui .opblock-title_normal p),
:global(.dark .yomu-api-reference .swagger-ui table thead tr th),
:global(.dark .yomu-api-reference .swagger-ui table tbody tr td),
:global(.dark .yomu-api-reference .swagger-ui .parameter__name),
:global(.dark .yomu-api-reference .swagger-ui .response-col_status),
:global(.dark .yomu-api-reference .swagger-ui .response-col_description),
:global(.dark .yomu-api-reference .swagger-ui .tab li),
:global(.dark .yomu-api-reference .swagger-ui label),
:global(.dark .yomu-api-reference .swagger-ui .btn) {
    color: var(--vp-c-text-1);
}

:global(.dark .yomu-api-reference .swagger-ui .parameter__type),
:global(.dark .yomu-api-reference .swagger-ui .prop-format),
:global(.dark .yomu-api-reference .swagger-ui .response-col_links) {
    color: var(--vp-c-text-2);
}

:global(.dark .yomu-api-reference .swagger-ui .opblock-section-header),
:global(.dark .yomu-api-reference .swagger-ui .responses-inner) {
    background: var(--vp-c-bg);
    color: var(--vp-c-text-1);
    box-shadow: none;
}

:global(.dark .yomu-api-reference .swagger-ui .opblock-tag svg),
:global(.dark .yomu-api-reference .swagger-ui .expand-operation svg),
:global(.dark .yomu-api-reference .swagger-ui .models-control svg),
:global(.dark .yomu-api-reference .swagger-ui .authorization__btn svg) {
    fill: var(--vp-c-text-1);
}

@media (max-width: 700px) {
    .yomu-api-reference {
        padding: 24px 12px 56px;
    }

    .yomu-api-toolbar {
        align-items: stretch;
        flex-direction: column;
        gap: 16px;
    }

    .yomu-api-controls {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        align-items: end;
    }

    .yomu-api-controls select {
        width: 100%;
        min-width: 0;
    }

    :deep(.swagger-ui .opblock .opblock-summary) {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    :deep(.swagger-ui .opblock .opblock-summary-path) {
        max-width: calc(100vw - 28px);
        overflow-wrap: anywhere;
    }
}

@media (prefers-reduced-motion: reduce) {
    .yomu-api-reference *,
    .yomu-api-reference *::before,
    .yomu-api-reference *::after {
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
    }
}
</style>
