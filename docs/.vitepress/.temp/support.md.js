import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Support","description":"","frontmatter":{},"headers":[],"relativePath":"support.md","filePath":"support.md","lastUpdated":1778580932000}');
const _sfc_main = { name: "support.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="support" tabindex="-1">Support <a class="header-anchor" href="#support" aria-label="Permalink to &quot;Support&quot;">​</a></h1><p>よむ is free. Donations are optional, but they genuinely matter: they help cover testing devices, services, and the time needed to keep the project alive.</p><div class="yomu-callout"><strong>Feature request promise:</strong> if you donate and leave a よむ feature request in the PayPal message, I will personally read it and implement it when it is feasible, legal, and within the project’s scope. </div><p>I am trying to keep よむ generous instead of locking core study features behind a subscription. Even one small donation makes that feel more possible.</p><h2 id="links" tabindex="-1">Links <a class="header-anchor" href="#links" aria-label="Permalink to &quot;Links&quot;">​</a></h2><ul><li>Install userscript: <a href="https://raw.githubusercontent.com/HRussellZFAC023/yomu-reader/main/dist/yomu.user.js" target="_blank" rel="noreferrer">dist/yomu.user.js</a></li><li>Source code: <a href="https://github.com/HRussellZFAC023/yomu-reader" target="_blank" rel="noreferrer">GitHub repository</a></li><li>Bug reports and feature requests: <a href="https://github.com/HRussellZFAC023/yomu-reader/issues" target="_blank" rel="noreferrer">GitHub issues</a></li><li>Donations: <a href="https://paypal.me/HenryRussell163" target="_blank" rel="noreferrer">PayPal</a></li><li>Discord: <code>henry281199</code></li></ul><h2 id="before-asking-for-help" tabindex="-1">Before Asking For Help <a class="header-anchor" href="#before-asking-for-help" aria-label="Permalink to &quot;Before Asking For Help&quot;">​</a></h2><p>Useful details make support much faster:</p><ol><li>Your browser and device, for example Chrome on Windows, Safari on iPad, or Firefox on Android.</li><li>Which userscript manager you installed, for example Tampermonkey or Userscripts.</li><li>What page you were on.</li><li>What you expected to happen.</li><li>What happened instead.</li><li>A screenshot if the issue is visual.</li></ol><h2 id="what-is-coming-soon" tabindex="-1">What Is Coming Soon <a class="header-anchor" href="#what-is-coming-soon" aria-label="Permalink to &quot;What Is Coming Soon&quot;">​</a></h2><p>Native Chrome, Firefox, and Safari extensions are planned. The current supported release is the userscript.</p><p>GreasyFork publishing is also planned so non-technical users get a friendlier install and automatic update path.</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("support.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const support = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  support as default
};
