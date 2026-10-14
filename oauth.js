import {instanceFromTabUrl} from './salesforce-url.js';

function randomString() {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(32)));
}
function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function oauthRedirectUrl() {
  return chrome.identity.getRedirectURL('salesforce');
}
export function authorizationCode(callback, redirectUri, state) {
  const url = new URL(callback), expected = new URL(redirectUri);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.searchParams.get('state') !== state) {
    throw Error('Salesforce sign-in returned an invalid callback. Please reconnect.');
  }
  if (url.searchParams.has('error')) throw Error(`Salesforce sign-in failed: ${url.searchParams.get('error')}`);
  const code = url.searchParams.get('code');
  if (!code) throw Error('Salesforce did not return an authorization code.');
  return code;
}
export async function connectSalesforce(instance, clientId) {
  const origin = instanceFromTabUrl(instance);
  if (!origin) throw Error('Enter a supported Salesforce instance URL.');
  if (!clientId.trim()) throw Error('Enter the Salesforce OAuth Consumer Key (Client ID). Your administrator configures this once.');
  const redirectUri = oauthRedirectUrl(), verifier = randomString(), state = randomString();
  const challenge = encodeBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const authorize = new URL('/services/oauth2/authorize', origin);
  authorize.search = new URLSearchParams({response_type:'code',client_id:clientId.trim(),redirect_uri:redirectUri,scope:'api',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();
  let callback;
  try { callback = await chrome.identity.launchWebAuthFlow({url:authorize.href,interactive:true}); }
  catch { throw Error('Salesforce sign-in was cancelled or could not finish. Check the app callback URL and OAuth policies, then try again.'); }
  if (!callback) throw Error('Salesforce sign-in did not complete.');
  const code = authorizationCode(callback, redirectUri, state);
  const response = await fetch(`${origin}/services/oauth2/token`, {
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
    body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId.trim(),redirect_uri:redirectUri,code,code_verifier:verifier})
  });
  const data = await response.json();
  if (!response.ok) throw Error(`Salesforce token exchange failed (${data.error || response.status}). Verify PKCE is enabled and Require Secret for Web Server Flow is disabled.`);
  const returnedOrigin = data.instance_url && instanceFromTabUrl(data.instance_url);
  if (!data.access_token || !returnedOrigin) throw Error('Salesforce returned an incomplete or unsupported connection.');
  return {instance:returnedOrigin,token:data.access_token};
}
