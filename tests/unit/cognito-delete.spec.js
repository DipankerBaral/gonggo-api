// Deleting an account must also delete the person's Cognito sign-in.
// We swap in a fake AWS client and check the exact request GongGo would send.
const { test, expect } = require('@playwright/test');
const config = require('../../src/config');
const { deleteCognitoUser, useSender } = require('../../src/auth/cognitoAdmin');

test('in real sign-in mode, deletes the Cognito user by username', async () => {
  const saved = { ...config.auth };
  Object.assign(config.auth, { mode: 'cognito', userPoolId: 'ap-southeast-2_Pool1' });
  const sent = [];
  useSender(async (command) => { sent.push(command.input); });
  try {
    expect(await deleteCognitoUser('google_1234567890')).toEqual({ deleted: true });
    expect(sent).toEqual([{ UserPoolId: 'ap-southeast-2_Pool1', Username: 'google_1234567890' }]);
  } finally {
    Object.assign(config.auth, saved);
  }
});

test('an account already gone from Cognito counts as deleted', async () => {
  const saved = { ...config.auth };
  Object.assign(config.auth, { mode: 'cognito', userPoolId: 'ap-southeast-2_Pool1' });
  useSender(async () => { const e = new Error('gone'); e.name = 'UserNotFoundException'; throw e; });
  try {
    expect(await deleteCognitoUser('someone')).toEqual({ deleted: true });
  } finally {
    Object.assign(config.auth, saved);
  }
});

test('in dev sign-in mode there is no Cognito user to delete', async () => {
  expect(await deleteCognitoUser('anyone')).toEqual({ skipped: true });
});
