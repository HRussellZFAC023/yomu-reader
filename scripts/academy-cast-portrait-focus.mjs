#!/usr/bin/env node

import path from 'node:path';
import { refreshAcademyCastPortraitFocus } from './lib/academy-cast-portrait-focus.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const result = await refreshAcademyCastPortraitFocus(repoRoot);
console.log(`Mapped ${result.assetCount} cast sprites across ${result.castCount} conversational focus profiles.`);
