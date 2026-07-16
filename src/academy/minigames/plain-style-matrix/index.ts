import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradePlainStyleMatrix, plainStyleMatrixReviewSeeds, validatePlainStyleMatrix } from './engine';
import { PLAIN_STYLE_MATRIX_KIND, type PlainStyleMatrixModel, type PlainStyleMatrixResponse } from './manifest';
import { renderPlainStyleMatrix } from './view';

export const plainStyleMatrixPlugin: ActivityPlugin<PlainStyleMatrixModel, PlainStyleMatrixResponse> = {
    kind: PLAIN_STYLE_MATRIX_KIND, validate: validatePlainStyleMatrix, render: renderPlainStyleMatrix, grade: gradePlainStyleMatrix, toReviewSeeds: plainStyleMatrixReviewSeeds,
};

export * from './engine';
export * from './manifest';
