import test from "node:test";
import assert from "node:assert/strict";
import { parseRequestedPlayStep } from "./play-resume.ts";

test("episode/task v URL jsou 1-based a interně se převádí na 0-based", () => {
  const step = parseRequestedPlayStep({
    episodeParam: "2",
    taskParam: "3",
    episodeCount: 4,
    taskCountForEpisode: (episodeIndex) => (episodeIndex === 1 ? 5 : 2)
  });

  assert.deepEqual(step, {
    episodeIndex: 1,
    taskIndex: 2
  });
});

test("neplatný task neshodí episode a task vrátí jako null", () => {
  const step = parseRequestedPlayStep({
    episodeParam: "2",
    taskParam: "99",
    episodeCount: 4,
    taskCountForEpisode: () => 5
  });

  assert.deepEqual(step, {
    episodeIndex: 1,
    taskIndex: null
  });
});
