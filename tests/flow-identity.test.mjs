import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../flow-identity.js',import.meta.url),'utf8');
const {flowFilter,flowApiName}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('look up a packaged flow by separate namespace and developer name',()=>{
  assert.equal(flowFilter('setup_service_plan__CheckEligibility'),"Definition.DeveloperName = 'CheckEligibility' AND Definition.NamespacePrefix = 'setup_service_plan'");
  assert.equal(flowFilter('svc_itom_intelligence__SoftDelCmdbCi'),"Definition.DeveloperName = 'SoftDelCmdbCi' AND Definition.NamespacePrefix = 'svc_itom_intelligence'");
});
test('local flows cannot accidentally match a package with the same name',()=>{
  assert.equal(flowFilter('CheckEligibility'),"Definition.DeveloperName = 'CheckEligibility' AND Definition.NamespacePrefix = null");
});
test('record ID lookup retains the namespace for metadata reads and later queries',()=>{
  assert.equal(flowApiName({DeveloperName:'CheckEligibility',NamespacePrefix:'setup_service_plan'}),'setup_service_plan__CheckEligibility');
  assert.equal(flowApiName({DeveloperName:'CheckEligibility',NamespacePrefix:null}),'CheckEligibility');
  assert.equal(flowApiName(undefined),undefined);
});
test('reject unsafe or incomplete API names before constructing a query',()=>{
  for(const name of ["Flow' OR Id != null",'pkg__','Flow-1',''])assert.throws(()=>flowFilter(name));
});
