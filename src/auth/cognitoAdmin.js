// Deletes a person's sign-in from Cognito when they delete their GongGo account.
// The container's IAM role is allowed to do exactly this, for this user pool,
// and nothing else (see infra/ecs.tf).
const config = require('../config');

let send = null; // swappable in tests

function client() {
  if (!send) {
    const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
    const cognito = new CognitoIdentityProviderClient({ region: config.auth.region });
    send = (command) => cognito.send(command);
  }
  return send;
}

async function deleteCognitoUser(username) {
  if (config.auth.mode !== 'cognito' || !username) return { skipped: true }; // dev sign-in has no Cognito user
  const { AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
  try {
    await client()(new AdminDeleteUserCommand({ UserPoolId: config.auth.userPoolId, Username: username }));
    return { deleted: true };
  } catch (err) {
    if (err.name === 'UserNotFoundException') return { deleted: true }; // already gone
    throw err;
  }
}

module.exports = { deleteCognitoUser, useSender: (fn) => { send = fn; } };
