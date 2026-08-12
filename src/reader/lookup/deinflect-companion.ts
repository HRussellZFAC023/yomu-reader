import { aggregateRuntimeModules } from '../companions/aggregate-runtime-modules';

export type { LanguageLookupCandidate as DeinflectedTerm } from '../languages/types';

const deinflection = aggregateRuntimeModules().deinflection;

export const {
    deinflectJapaneseTerm,
    termRulesMatch,
} = deinflection;
