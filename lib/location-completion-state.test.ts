import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCompletionUpdate } from './location-completion-state.ts';

test('first completion triggers unlock and completed status', () => {
  const result = deriveCompletionUpdate({ existing: null, finalPenalty: 15, source: 'gameplay' });
  assert.equal(result.shouldInsert, true);
  assert.equal(result.firstCompletionTriggered, true);
  assert.equal(result.nextStatus, 'completed');
});

test('replay in-progress row finalizes without second unlock', () => {
  const result = deriveCompletionUpdate({
    existing: { status: 'in_progress', first_completed_at: '2026-05-20T10:00:00.000Z', penalty_points: 30, best_score: 90 },
    finalPenalty: 15,
    source: 'gameplay'
  });
  assert.equal(result.shouldUpdate, true);
  assert.equal(result.firstCompletionTriggered, false);
  assert.equal(result.nextStatus, 'completed');
  assert.equal(result.bestScoreUpdated, true);
});

test('replay completion keeps better historical result when new score is worse', () => {
  const result = deriveCompletionUpdate({
    existing: { status: 'completed', first_completed_at: '2026-05-20T10:00:00.000Z', penalty_points: 15, best_score: 105 },
    finalPenalty: 30,
    source: 'gameplay'
  });
  assert.equal(result.firstCompletionTriggered, false);
  assert.equal(result.bestScoreUpdated, false);
});

test('replay never triggers second unlock', () => {
  const result = deriveCompletionUpdate({
    existing: { status: 'completed', first_completed_at: '2026-05-20T10:00:00.000Z', penalty_points: 30, best_score: 90 },
    finalPenalty: 10,
    source: 'gameplay'
  });
  assert.equal(result.firstCompletionTriggered, false);
  assert.equal(result.bestScoreUpdated, true);
});
