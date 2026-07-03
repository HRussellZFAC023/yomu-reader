import { yomuKanjiStudyCompanion } from '../companions/registry';
import type { StudySourceController as StudySourceControllerImpl } from './sources';

type StudySourceControllerClass = typeof StudySourceControllerImpl;
type StudySourceControllerInstance = InstanceType<StudySourceControllerClass>;
export type StudySourceControllerDependencies = ConstructorParameters<StudySourceControllerClass>[0];

class DisabledStudySourceController {
    renderTranslationSource(): string {
        return '';
    }

    renderGrammarSource(): string {
        return '';
    }

    installLoaders(): void {}

    detectGrammarHints(): Promise<[]> {
        return Promise.resolve([]);
    }
}

const CompanionBackedStudySourceController = class {
    constructor(dependencies: StudySourceControllerDependencies) {
        const Controller = yomuKanjiStudyCompanion()?.StudySourceController;
        return Controller
            ? new Controller(dependencies)
            : new DisabledStudySourceController() as unknown as StudySourceControllerInstance;
    }
};

export { CompanionBackedStudySourceController as StudySourceController };
