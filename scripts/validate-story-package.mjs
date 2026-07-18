#!/usr/bin/env node
// Static validator for yomu-academy.story-package.v2 chapter JSON.
// Automates the checkable subset of SCRIPT-ARCHITECTURE.md gates so authored
// chapters can be gated before the generic runtime loader (Track A) lands.
// Usage: node scripts/validate-story-package.mjs <file.v2.json> [more...]
import { readFileSync } from 'node:fs';

const NODE_KINDS = new Set(['line', 'message', 'narration', 'choice', 'activity', 'command', 'stage', 'checkpoint']);
const BANDS = ['foundation', 'n5', 'n4', 'n3', 'n2', 'n1', 'ngPlus'];

function validate(path) {
  const errors = [];
  const warns = [];
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { path, errors: [`JSON parse failed: ${e.message}`], warns: [] };
  }

  const E = (m) => errors.push(m);
  const W = (m) => warns.push(m);

  // 1. schema + required top-level fields
  if (pkg.schema !== 'yomu-academy.story-package.v2') E(`schema must be yomu-academy.story-package.v2 (got ${pkg.schema})`);
  for (const f of ['id', 'revision', 'canonicality', 'season', 'title', 'synopsis', 'sourceSafety', 'cast', 'entry', 'scenes', 'callbacks', 'outcomes', 'replay']) {
    if (pkg[f] === undefined) E(`missing top-level field: ${f}`);
  }
  if (!['canon', 'appointment-canon', 'bridge', 'alumni', 'practice-remix'].includes(pkg.canonicality)) E(`invalid canonicality: ${pkg.canonicality}`);

  // sourceSafety fixed values (gate 6)
  const ss = pkg.sourceSafety || {};
  if (ss.originalYomu !== true) E('sourceSafety.originalYomu must be true');
  if (ss.externalDialogueUsed !== false) E('sourceSafety.externalDialogueUsed must be false');
  if (ss.realEventClaim !== false) E('sourceSafety.realEventClaim must be false');
  if (ss.fictionalComposite !== true) E('sourceSafety.fictionalComposite must be true');

  // 4/5. cast: declared, 1 lead, <=2 support, valid portrayal
  const cast = Array.isArray(pkg.cast) ? pkg.cast : [];
  const castIds = new Set(cast.map((c) => c.castId));
  const leads = cast.filter((c) => c.role === 'lead');
  if (leads.length !== 1) E(`cast must have exactly 1 lead (got ${leads.length})`);
  // The 1-lead/<=2-support ensemble cap is PER SCENE, not per package (s1e01 lists 6 supports
  // across its mission branches). Package cast[] may list everyone who speaks anywhere.
  for (const c of cast) {
    if (!['fiction-cleared', 'lesson-cleared', 'likeness-cleared', 'name-only'].includes(c.portrayal)) E(`cast ${c.castId}: invalid portrayal ${c.portrayal}`);
    if (c.portraitAsset && c.portrayal !== 'likeness-cleared') E(`cast ${c.castId}: portraitAsset requires likeness-cleared portrayal`);
  }

  // Collect all node/scene ids for reference integrity
  const allIds = new Set();
  const dupIds = new Set();
  const add = (id) => { if (id === undefined) return; if (allIds.has(id)) dupIds.add(id); allIds.add(id); };
  add(pkg.id);
  for (const c of pkg.callbacks || []) add(c.id);
  for (const o of pkg.outcomes || []) add(o.id);
  const sceneIds = new Set();
  const nodeIds = new Set();
  const speakers = new Set();

  const scenes = Array.isArray(pkg.scenes) ? pkg.scenes : [];
  for (const sc of scenes) {
    add(sc.id); sceneIds.add(sc.id);
    if (!sc.goal || !sc.dramaticQuestion || !sc.learnerNeed) E(`scene ${sc.id}: goal/dramaticQuestion/learnerNeed all required`);
    if (sc.checkpointOnEnter !== true) E(`scene ${sc.id}: checkpointOnEnter must be true`);
    if (typeof sc.locationId !== 'string' || !sc.locationId.startsWith('location:')) E(`scene ${sc.id}: locationId must use the location: alias namespace (got ${sc.locationId})`);
    const nodes = Array.isArray(sc.nodes) ? sc.nodes : [];
    for (const n of nodes) {
      add(n.id); nodeIds.add(n.id);
      if (!NODE_KINDS.has(n.kind)) E(`node ${n.id}: unknown kind ${n.kind}`);
      if (n.kind === 'line' || n.kind === 'message') {
        if (!n.speakerId) E(`line ${n.id}: missing speakerId`);
        else if (n.speakerId !== 'learner') speakers.add(n.speakerId);
        const variants = n.variants || {};
        const present = Object.keys(variants).filter((k) => BANDS.includes(k));
        if (present.length === 0) E(`line ${n.id}: no band variants`);
        for (const b of present) {
          const v = variants[b];
          if (!v || !v.japanese || !v.reading || v.english === undefined) E(`line ${n.id} band ${b}: japanese/reading/english all required`);
        }
      }
      if (n.kind === 'choice') {
        if (!Array.isArray(n.options) || n.options.length < 2) E(`choice ${n.id}: needs >=2 options`);
        if (!n.convergence) E(`choice ${n.id}: missing convergence`);
      }
      if (n.kind === 'command' && n.command) {
        const t = n.command.type;
        // Runtime accepts any {type} and lets domain handlers validate; s1e01 uses
        // story.seen/story.completed/callback.transitioned. Unknown -> warning, not hard error.
        const ok = ['story.seen', 'story.completed', 'relationship.continuityAdvanced', 'relationship.appointmentCompleted', 'callback.transitioned', 'world.locationDiscovered', 'journal.memoryUnlocked', 'presentation.cue'];
        if (!ok.includes(t)) W(`command ${n.id}: type ${t} not on documented whitelist`);
      }
    }
  }

  // reference integrity (gate 2): choice.next/convergence, activity flow, exit.next
  const nodeAndScene = new Set([...nodeIds, ...sceneIds]);
  for (const sc of scenes) {
    for (const n of sc.nodes || []) {
      if (n.kind === 'choice') {
        for (const o of n.options || []) {
          if (!nodeAndScene.has(o.next)) E(`choice ${n.id} option ${o.id}: next -> unknown ${o.next}`);
          if (!Array.isArray(o.records)) E(`choice ${n.id} option ${o.id}: records[] required`);
        }
        if (!nodeAndScene.has(n.convergence)) E(`choice ${n.id}: convergence -> unknown ${n.convergence}`);
      }
      if (n.kind === 'activity') {
        for (const f of ['onReady', 'onRepair', 'onDefer']) {
          if (!nodeAndScene.has(n[f])) E(`activity ${n.id}: ${f} -> unknown ${n[f]}`);
        }
        if (!n.hook || !n.hook.componentType) E(`activity ${n.id}: hook.componentType required`);
        if (!n.requiredEvidence || n.requiredEvidence.activityId !== (n.hook && n.hook.exerciseId)) E(`activity ${n.id}: requiredEvidence.activityId must equal hook.exerciseId`);
        // gate 3: a checkpoint must precede the activity in the same scene
        const idx = sc.nodes.indexOf(n);
        const hasPriorCheckpoint = sc.nodes.slice(0, idx).some((x) => x.kind === 'checkpoint');
        if (!hasPriorCheckpoint) E(`activity ${n.id}: no resumable checkpoint before it in scene ${sc.id}`);
      }
    }
    if (sc.exit === undefined || sc.exit.checkpoint !== true) E(`scene ${sc.id}: exit.checkpoint must be true`);
    // exit.next may target a scene OR an in-scene node (s1e01 exits into choice:blank-atlas:mission).
    if (sc.exit && sc.exit.next !== null && !nodeAndScene.has(sc.exit.next)) E(`scene ${sc.id}: exit.next -> unknown ${sc.exit.next}`);
    // per-scene ensemble cap: 1 lead + <=2 supports = <=3 distinct speakers (warning)
    const sceneSpeakers = new Set((sc.nodes || []).filter((n) => (n.kind === 'line' || n.kind === 'message') && n.speakerId && n.speakerId !== 'learner').map((n) => n.speakerId));
    if (sceneSpeakers.size > 3) W(`scene ${sc.id}: ${sceneSpeakers.size} distinct speakers (ensemble cap is 3)`);
  }

  // duplicate ids (gate 1)
  for (const d of dupIds) E(`duplicate id: ${d}`);

  // speakers declared (gate 4)
  for (const sp of speakers) if (!castIds.has(sp)) E(`speaker ${sp} not declared in cast[]`);

  // callbacks (gate 11)
  for (const cb of pkg.callbacks || []) {
    if (!['seed', 'echo', 'transform', 'payoff'].includes(cb.state)) E(`callback ${cb.id}: invalid state ${cb.state}`);
    if (cb.state !== 'seed' && !cb.priorUse) E(`callback ${cb.id}: ${cb.state} requires priorUse`);
    if (cb.useNumber !== undefined && cb.maximumUses !== undefined && cb.useNumber > cb.maximumUses) E(`callback ${cb.id}: useNumber ${cb.useNumber} > maximumUses ${cb.maximumUses}`);
    if (!cb.meaningNow) E(`callback ${cb.id}: meaningNow required`);
  }

  // replay (gate: allowedLayers subset of bands, canonicalWrites false)
  const rp = pkg.replay || {};
  if (rp.canonicalWrites !== false) E('replay.canonicalWrites must be false');
  for (const l of rp.allowedLayers || []) if (!BANDS.includes(l)) E(`replay.allowedLayers: unknown band ${l}`);

  // full-multi-band coverage check (owner decision): warn if a line has fewer bands than the package's allowedLayers spoken set
  const spokenBandTargets = (rp.allowedLayers || []).filter((l) => l !== 'ngPlus');
  for (const sc of scenes) for (const n of sc.nodes || []) {
    if (n.kind === 'line') {
      const present = Object.keys(n.variants || {}).filter((k) => BANDS.includes(k));
      const missing = spokenBandTargets.filter((b) => !present.includes(b));
      if (missing.length) W(`line ${n.id}: missing bands ${missing.join(',')} (full-multi-band target)`);
    }
  }

  return { path, errors, warns };
}

let bad = 0;
for (const path of process.argv.slice(2)) {
  const { errors, warns } = validate(path);
  const name = path.split('/').pop();
  if (errors.length === 0) {
    console.log(`✓ ${name}  (${warns.length} warnings)`);
  } else {
    bad++;
    console.log(`✗ ${name}  ${errors.length} errors`);
    for (const e of errors) console.log(`   ERROR ${e}`);
  }
  for (const w of warns) console.log(`   warn  ${w}`);
}
process.exit(bad ? 1 : 0);
