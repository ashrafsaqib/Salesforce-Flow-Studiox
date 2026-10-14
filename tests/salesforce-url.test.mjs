import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../salesforce-url.js',import.meta.url),'utf8');
const {instanceFromTabUrl}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for(const partition of ['', 'sandbox.', 'develop.', 'scratch.', 'demo.', 'patch.', 'trailblaze.', 'free.']){
  for(const suffix of ['lightning.force.com','my.salesforce-setup.com','my.salesforce.com']){
    test(`detect ${partition}${suffix} Flow Builder`,()=>{
      const url=`https://example-org.${partition}${suffix}/builder_platform_interaction/flowBuilder.app?flowId=301000000000001`;
      assert.equal(instanceFromTabUrl(url),`https://example-org.${partition}my.salesforce.com`);
    });
  }
}

test('retain supported legacy instance hosts',()=>{
  for(const instance of ['na123','eu12','ap10','cs50','um1'])assert.equal(instanceFromTabUrl(`https://${instance}.salesforce.com/path`),`https://${instance}.salesforce.com`);
});

test('reject unrelated, deceptive, and insecure hosts',()=>{
  for(const url of [
    'https://login.salesforce.com/',
    'https://example.com/',
    'https://org.trailblaze.my.salesforce.com.example.com/',
    'https://org.unknown.my.salesforce.com/',
    'http://org.my.salesforce.com/',
    'https://user:password@org.my.salesforce.com/',
    'https://org.my.salesforce.com:8443/'
  ])assert.equal(instanceFromTabUrl(url),null,url);
});
