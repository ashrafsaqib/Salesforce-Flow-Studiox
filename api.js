export const NS = 'http://soap.sforce.com/2006/04/metadata';
export const escapeXml = s => String(s).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function parseXml(xml) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('DTD and entities are not allowed.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('Invalid XML.');
  return doc;
}
export const elements = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
export const value = (doc, name) => elements(doc, name)[0]?.textContent ?? '';
export function draftXml(xml) {
  const doc = parseXml(xml), root = doc.documentElement;
  if (root.localName !== 'Flow' || root.namespaceURI !== NS) throw Error('Expected a Salesforce Flow XML document.');
  if (elements(doc, 'fullName').length) throw Error('Flow file must not contain fullName.');
  const statuses = [...root.children].filter(n => n.localName === 'status');
  if (statuses.length !== 1) throw Error('Flow must have exactly one status element.');
  statuses[0].textContent = 'Draft';
  return new XMLSerializer().serializeToString(doc);
}
export async function soap(config, operation, body) {
  const response = await fetch(`${config.instance}/services/Soap/m/${config.version}`, {
    method:'POST', credentials:'omit', headers:{'Content-Type':'text/xml; charset=UTF-8', SOAPAction:operation},
    body:`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns="${NS}"><s:Header><SessionHeader><sessionId>${escapeXml(config.token)}</sessionId></SessionHeader></s:Header><s:Body><${operation}>${body}</${operation}></s:Body></s:Envelope>`
  });
  const doc = parseXml(await response.text());
  const fault = value(doc, 'faultstring');
  if (fault || !response.ok) throw Error(fault || `Salesforce HTTP ${response.status}`);
  return doc;
}
export async function query(config, soql, options = {}) {
  const response = await fetch(`${config.instance}/services/data/v${config.version}/tooling/query/?q=${encodeURIComponent(soql)}`, {credentials:'omit',headers:{Authorization:`Bearer ${config.token}`},signal:options.signal});
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data[0]?.message || `Salesforce HTTP ${response.status}`), {httpStatus:response.status});
  return data.records;
}
// A small uncompressed ZIP writer: Metadata API accepts ordinary STORE archives.
export function zip(files) {
  const encoder = new TextEncoder(), chunks = [], central = []; let offset = 0;
  const header = (size) => { const bytes=new Uint8Array(size); return [bytes,new DataView(bytes.buffer)]; };
  for (const [path,text] of Object.entries(files)) {
    const name=encoder.encode(path), data=encoder.encode(text); let crc=0xffffffff;
    for (const byte of data) { crc^=byte; for(let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); } crc=(crc^0xffffffff)>>>0;
    const [local,l]=header(30); l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint32(14,crc,true); l.setUint32(18,data.length,true); l.setUint32(22,data.length,true); l.setUint16(26,name.length,true);
    const [entry,c]=header(46); c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint32(16,crc,true); c.setUint32(20,data.length,true); c.setUint32(24,data.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true);
    chunks.push(local,name,data); central.push(entry,name); offset+=local.length+name.length+data.length;
  }
  const size=central.reduce((n,b)=>n+b.length,0), [end,e]=header(22); e.setUint32(0,0x06054b50,true); e.setUint16(8,central.length/2,true); e.setUint16(10,central.length/2,true); e.setUint32(12,size,true); e.setUint32(16,offset,true);
  const bytes=new Uint8Array(offset+size+22); let cursor=0; for(const chunk of [...chunks,...central,end]){bytes.set(chunk,cursor);cursor+=chunk.length;} return bytes;
}
export function base64(bytes) { let result=''; for(let i=0;i<bytes.length;i+=8192) result+=String.fromCharCode(...bytes.subarray(i,i+8192)); return btoa(result); }
