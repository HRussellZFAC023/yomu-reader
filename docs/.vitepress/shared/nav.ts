/**
 * The nav the docs build reads. The list itself lives in
 * src/reader/app/site-nav.ts, because two of its consumers cannot import
 * anything under docs/.vitepress: the hosted Study shell is compiled from
 * src/**, and the standalone PDF Reader and Video Player pages are static
 * documents served outside the VitePress theme. This file stays so the docs
 * config and theme keep their import path.
 */
export { APPS_NAV_LABEL, OVERFLOW_LABEL, docsNav, hostedOverflowLinks, hostedShellNavMarkup, studyShellNavRoutes, type HostedShellNavLink } from '../../../src/reader/app/site-nav';
