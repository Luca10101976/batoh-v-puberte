import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHistoricalLocationCompletion, isActiveInProgressLocation, isCompletedLocationProgress } from './location-progress-state.ts';

test('completed row is completed', () => {
  assert.equal(isCompletedLocationProgress({ status: 'completed', completed_at: '2026-05-21T12:00:00.000Z' }), true);
});

test('in-progress row is not completed even when completed_at is present', () => {
  assert.equal(
    isCompletedLocationProgress({ status: 'in_progress', completed_at: '2026-05-21T12:00:00.000Z' }),
    false
  );
});

test('legacy row with first_completed_at is completed', () => {
  assert.equal(
    isCompletedLocationProgress({ first_completed_at: '2026-05-21T12:00:00.000Z', completed_at: '2026-05-21T12:00:00.000Z' }),
    true
  );
});

test('row without explicit completed markers is not completed', () => {
  assert.equal(isCompletedLocationProgress({ completed_at: '2026-05-21T12:00:00.000Z' }), false);
});


test('replay row stays historically completed and zároveň active in progress', () => {
  const row = {
    status: 'in_progress' as const,
    first_completed_at: '2026-05-20T10:00:00.000Z',
    completed_at: '2026-05-21T12:00:00.000Z'
  };
  assert.equal(hasHistoricalLocationCompletion(row), true);
  assert.equal(isActiveInProgressLocation(row), true);
  assert.equal(isCompletedLocationProgress(row), false);
});
