import { arCatalog } from "./ar";
import { daCatalog } from "./da";
import { deCatalog } from "./de";
import { elCatalog } from "./el";
import { enCatalog } from "./en";
import { esCatalog } from "./es";
import { faCatalog } from "./fa";
import { fiCatalog } from "./fi";
import { frCatalog } from "./fr";
import { grcCatalog } from "./grc";
import { huCatalog } from "./hu";
import { idCatalog } from "./id";
import { itCatalog } from "./it";
import { kmCatalog } from "./km";
import { koCatalog } from "./ko";
import { laCatalog } from "./la";
import { loCatalog } from "./lo";
import { mnCatalog } from "./mn";
import { nlCatalog } from "./nl";
import { plCatalog } from "./pl";
import { ptCatalog } from "./pt";
import { roCatalog } from "./ro";
import { ruCatalog } from "./ru";
import { shCatalog } from "./sh";
import { sqCatalog } from "./sq";
import { svCatalog } from "./sv";
import { thCatalog } from "./th";
import { tlCatalog } from "./tl";
import { trCatalog } from "./tr";
import { viCatalog } from "./vi";
import { yueCatalog } from "./yue";
import { zhCatalog } from "./zh";
import type { LearnerLanguageId } from "../types";
import type { YomuLocaleCatalog } from "../catalog";

export const LOCALE_CATALOGS: Readonly<
  Record<LearnerLanguageId, YomuLocaleCatalog>
> = Object.freeze({
  sq: sqCatalog,
  grc: grcCatalog,
  ar: arCatalog,
  yue: yueCatalog,
  zh: zhCatalog,
  da: daCatalog,
  nl: nlCatalog,
  en: enCatalog,
  fi: fiCatalog,
  fr: frCatalog,
  de: deCatalog,
  el: elCatalog,
  hu: huCatalog,
  id: idCatalog,
  it: itCatalog,
  km: kmCatalog,
  ko: koCatalog,
  lo: loCatalog,
  la: laCatalog,
  mn: mnCatalog,
  fa: faCatalog,
  pl: plCatalog,
  pt: ptCatalog,
  ro: roCatalog,
  ru: ruCatalog,
  sh: shCatalog,
  es: esCatalog,
  sv: svCatalog,
  tl: tlCatalog,
  th: thCatalog,
  tr: trCatalog,
  vi: viCatalog,
});
