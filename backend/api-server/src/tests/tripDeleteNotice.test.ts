import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blocksTripDelete, completedDeleteMessage } from '../services/tripDeleteNotice';

describe('deleting a finished trip', () => {
  it('a delivered or charge-reviewed trip can be deleted; invoiced, paid or part-paid ones stay', () => {
    assert.equal(blocksTripDelete({ status: 'Completed' }), false);
    assert.equal(blocksTripDelete({ status: 'Completed', paid_amount: 0 }), false);
    assert.equal(blocksTripDelete({ status: 'Completed', paid_amount: '0.00' }), false);
    assert.equal(blocksTripDelete({ status: 'Invoiced' }), true);
    assert.equal(blocksTripDelete({ status: 'Paid' }), true);
    assert.equal(blocksTripDelete({ status: 'Completed', paid_amount: 500 }), true);
  });

  it('tells the other operators who deleted which trips', () => {
    assert.deepEqual(completedDeleteMessage('Admin', ['TRP-0066']).title, 'Completed trip TRP-0066 deleted');
    assert.match(completedDeleteMessage('Admin', ['TRP-0066']).message, /^Admin deleted completed trip TRP-0066\. /);
    assert.match(completedDeleteMessage('Sara', ['TRP-1', 'TRP-2']).message, /^Sara deleted 2 completed trips: TRP-1, TRP-2\./);
  });
});
