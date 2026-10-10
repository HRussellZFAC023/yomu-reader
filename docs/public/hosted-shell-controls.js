// Browser entry point loaded with defer by both standalone HTML pages.
// Shared navigation behaviour for the standalone PDF and video pages.
(() => {
  const menu = document.querySelector('[data-overflow-menu]');
  const summary = document.querySelector('[data-overflow-summary]');
  if (!menu || !summary) return;
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    summary.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener('focusout', event => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a[href]')) menu.open = false;
  });
})();
