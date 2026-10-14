// Normalize Salesforce's documented Setup/Lightning hostnames to the API host.
export function instanceFromTabUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  const host = url.hostname;
  if (/^[a-z0-9-]+(?:\.(?:sandbox|develop))?\.my\.salesforce-setup\.com$/.test(host)) {
    return `https://${host.replace(/\.my\.salesforce-setup\.com$/, '.my.salesforce.com')}`;
  }
  if (/^[a-z0-9-]+(?:\.(?:sandbox|develop))?\.lightning\.force\.com$/.test(host)) {
    return `https://${host.replace(/\.lightning\.force\.com$/, '.my.salesforce.com')}`;
  }
  if (/^[a-z0-9-]+(?:\.(?:sandbox|develop))?\.my\.salesforce\.com$/.test(host) || /^(?:na|eu|ap|cs|um)\d+\.salesforce\.com$/.test(host)) return url.origin;
  return null;
}
