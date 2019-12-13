import request from 'superagent';
import { ACTIVITY_TYPE_ELECTRICITY } from '../../definitions';

// Store agent to persist cookies
const agent = request.agent();
// DOMParser for value extraction
const DomParser = require('xmldom').DOMParser;

const emailField = 'formInputFields%5Busername%5D';
const passwordField = 'formInputFields%5Bpassword%5D';
let _sessionId = null;

/**
 * Load the login form and extract sessionFormUID which can then be used to submit a login.
 * This appears to be a CSRF token
 */
function getSessionId() {
  if (_sessionId !== null) {
    return Promise.resolve(_sessionId);
  }
  return agent
    .get('https://www.scottishpower.co.uk/account/login.process')
    .then((response) => {
      const parser = new DomParser().parseFromString(response.text, 'text/html');
      _sessionId = parser.getElementById('sessionFormUID').getAttribute('value');
      return _sessionId;
    }).catch(() => null);
}

/**
 * Logs in to the website. CSRF token is obtained first, then credentials are posted.
 * The expected response is a 302 redirection that doesn't redirect back to the login page.
 * @param username
 * @param password
 * @returns {Promise<boolean>} If login was successful
 */
function postCredentials(username, password) {
  // Initialise the agent
  return getSessionId()
    .then(session => agent
      .post('https://www.scottishpower.co.uk/account/login.process?execution=e1s1')
      .send(`${emailField}=${username}`)
      .send(`${passwordField}=${password}`)
      .send(`sessionFormUID=${session}`)
      .send('_eventId_login=Log+in')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36')
      .set('Referer', 'https://www.scottishpower.co.uk/account/login.process?execution=e1s1')
      .set('Sec-Fetch-Mode', 'navigate')
      .set('Sec-Fetch-Site', 'same-origin')
      .set('Sec-Fetch-User', '?1')
      .set('Origin', 'https://www.scottishpower.co.uk')
      .redirects(0)
      .ok(res => res.status < 400)
      .then((response) => {
        if (response.status === 302
          && 'location' in response.header
          && !response.header['location'].startsWith('https://www.scottishpower.co.uk/account/login.process')) {
          return true;
        }
        return false;
      })
      .catch((error) => {
        console.log('Failure');
        console.log(error.status);
        console.log(error.text);
        return false;
      }));
}

function chooseContract(session) {
  return agent
    .post('https://www.scottishpower.co.uk/my-account/choosecontract.process?execution=e2s1&_eventId=submit')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36')
    .set('Referer', 'https://www.scottishpower.co.uk/my-account/choosecontract.process?execution=e2s1')
    .set('Sec-Fetch-Mode', 'navigate')
    .set('Sec-Fetch-Site', 'same-origin')
    .set('Sec-Fetch-User', '?1')
    .set('Origin', 'https://www.scottishpower.co.uk')
    .send(`sessionFormUID=${session}`);
}

async function login(email, password) {
  const success = await postCredentials(email, password);
  if (success) {
    await getSessionId().then(sessionId => chooseContract(sessionId).then((res) => {
      console.log('Yes');
      return true;
    })
      .catch(e => console.log(e)));
  }
}

async function getEnergyUsage() {
  await agent
    .get('https://www.scottishpower.co.uk/my-account/energyusage.process?execution=e1s1');
}

async function connect(requestLogin, requestWebView) {
  const { username, password } = await requestLogin();
  // Store username and password
  return {
    username,
    password,
  };
}

async function collect(state, activities) {
  const loggedIn = await login(state.username, state.password);
  if (loggedIn) {
    await getEnergyUsage();
  } else {
    throw new Error('Login error.');
  }

  return { activities: [], state };
}

const config = {
  description: 'Collects electricity usage from Scottish Power',
  label: 'Scottish Power',
  country: 'GB',
  isPrivate: true,
  type: ACTIVITY_TYPE_ELECTRICITY,
  contributors: ['bairdj'],
};

export default {
  connect,
  collect,
  config,
};
