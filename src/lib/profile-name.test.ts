import test from 'node:test';
import assert from 'node:assert/strict';
import {profileName} from './profile-name.ts';
test('a profile name with no letter or digit falls back to the login', () => {
 for (const name of ['-', ' - ', '...', '', '   ', null, undefined, 7, '🙂']) assert.equal(profileName(name, 'Wang-jiong-han'), 'Wang-jiong-han');
});
test('a profile name with a letter or digit is kept, trimmed', () => {
 for (const name of ['Ada Lovelace', ' Ada ', 'x', '3', '王小明', 'Zoë - Ann']) assert.equal(profileName(name, 'login'), name.trim());
});
