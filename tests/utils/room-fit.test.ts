import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { capacityLabel, participantsLabel, roomFitLabel } from '../../src/utils/room-fit';

describe('room fit texts', () => {
  test('participantsLabel and capacityLabel use singular and plural', () => {
    assert.equal(participantsLabel(1), '1 deltager');
    assert.equal(participantsLabel(4), '4 deltagere');
    assert.equal(capacityLabel(1), 'Plads til 1 person');
    assert.equal(capacityLabel(12), 'Plads til 12 personer');
  });

  test('says the room fits the group and that the whole room is reserved', () => {
    assert.equal(roomFitLabel(8, 4), 'Passer til 4 deltagere · hele lokalet reserveres');
    assert.equal(roomFitLabel(4, 1), 'Passer til 1 deltager · hele lokalet reserveres');
  });

  test('a room that is exactly full fits, without any "perfect size" wording', () => {
    assert.equal(roomFitLabel(4, 4), 'Passer til 4 deltagere · hele lokalet reserveres');
  });

  test('never mentions leftover seats', () => {
    for (const [capacity, participants] of [[12, 2], [8, 4], [4, 4]]) {
      assert.doesNotMatch(roomFitLabel(capacity, participants) ?? '', /ledige pladser|ekstra|Perfekt/);
    }
  });

  test('returns null when the room is too small or the count is invalid', () => {
    assert.equal(roomFitLabel(4, 5), null);
    assert.equal(roomFitLabel(4, 0), null);
    assert.equal(roomFitLabel(4, -1), null);
    assert.equal(roomFitLabel(4, 2.5), null);
  });
});
