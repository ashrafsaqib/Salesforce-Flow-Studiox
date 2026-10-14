// Preserve settings from older versions that used volatile session storage.
export async function migrateSessionSettings() {
  const keys = ['config', 'salesforceConnection'];
  const [persistent, legacy] = await Promise.all([
    chrome.storage.local.get(keys), chrome.storage.session.get(keys)
  ]);
  const missing = {};
  for (const key of keys) if (persistent[key] === undefined && legacy[key] !== undefined) missing[key] = legacy[key];
  if (Object.keys(missing).length) await chrome.storage.local.set(missing);
  await chrome.storage.session.remove(keys);
}
