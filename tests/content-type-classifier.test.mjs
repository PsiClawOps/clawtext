import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyContentType } from '../dist/content-type-classifier.js';

test('classifies preference statements with durable half-life', () => {
  const result = classifyContentType('I prefer concise updates and default to this workflow.');
  assert.equal(result.type, 'preference');
  assert.equal(result.halfLifeDays, 180);
});

test('classifies skill/knowledge statements', () => {
  const result = classifyContentType('We are experienced with TypeScript and can debug this pipeline quickly.');
  assert.equal(result.type, 'skill');
  assert.equal(result.halfLifeDays, 120);
});

test('classifies user/process attributes with shorter half-life', () => {
  const result = classifyContentType('My timezone is MST and hard stop is 2am.');
  assert.equal(result.type, 'attribute');
  assert.equal(result.halfLifeDays, 30);
});

test('decision precedence remains intact', () => {
  const result = classifyContentType('We decided to use local scoring; the plan is to keep this stable.');
  assert.equal(result.type, 'decision');
  assert.equal(result.halfLifeDays, Number.POSITIVE_INFINITY);
});
