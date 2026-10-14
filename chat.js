import {NS,escapeXml,parseXml,elements,value,draftXml,soap,query,zip,base64} from './api.js';
import {instanceFromTabUrl} from './salesforce-url.js';
import {connectSalesforce,oauthRedirectUrl} from './oauth.js';
import {migrateSessionSettings} from './settings-storage.js';
import {ActionProgress,EDIT_STEPS} from './progress.js';
import {MODES,UNDERSTAND_STEPS,flowRequest} from './flow-modes.js';
import {renderAnswer} from './answer-renderer.js';
const $ = id => document.getElementById(id);
let config, loaded, busy=false;
const tabId=Number(new URLSearchParams(location.search).get('tabId'));
let flowTabId=tabId,savedXml='';
let actionProgress;
let mode='understand',understandHistory=[],understandFlowKey='';
let rememberedFlow;
async function rememberFlow(name){
  rememberedFlow={name,instance:config.instance};
  await chrome.storage.local.set({flowContext:rememberedFlow});
}
function rememberedName(){return rememberedFlow?.instance===config?.instance?rememberedFlow.name:undefined;}
async function reopenFlow(name){
  const current=await latest(name);
  if(!current)throw Error('The remembered flow could not be found in Salesforce.');
  const url=new URL('/builder_platform_interaction/flowBuilder.app',config.instance);url.searchParams.set('flowId',current.Id);
  const tab=await chrome.tabs.create({url:url.href,active:true});flowTabId=tab.id;
  return current;
}
async function ensureFlowTab(){
  if(!loaded)return;
  try{const tab=await chrome.tabs.get(flowTabId);if(instanceFromTabUrl(tab.url)===config.instance)return;}catch{}
  await reopenFlow(loaded.name);
}
const modeViews={understand:{nodes:[],draft:''},edit:{nodes:[],draft:''}};
function renderMode(){
  const copy=MODES[mode];document.body.dataset.mode=mode;
  for(const key of Object.keys(MODES)){
    const button=$(key+'Mode');button.classList.toggle('selected',key===mode);button.setAttribute('aria-pressed',String(key===mode));
  }
  $('modeDescription').textContent=mode==='understand'?'Ask questions. Get clarity. Your flow stays unchanged.':'Turn ideas into a new draft. Completed changes save automatically.';
  $('welcomeEyebrow').textContent=copy.eyebrow;$('welcomeTitle').textContent=copy.title;$('welcomeDescription').textContent=copy.description;
  $('prompt').placeholder=copy.placeholder;$('promptLabel').textContent=mode==='understand'?'Ask a question about your flow':'Describe a change to your flow';
  $('sendLabel').textContent=copy.send;$('send').setAttribute('aria-label',mode==='understand'?'Ask about your flow':'Update your flow');$('composerNote').textContent=copy.note;
  $('suggestions').replaceChildren(...copy.suggestions.map(([label,prompt])=>{
    const button=document.createElement('button');button.type='button';button.className='suggestion';button.dataset.prompt=prompt;button.textContent=label;
    const arrow=document.createElement('span');arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');button.append(arrow);
    return button;
  }));
  $('welcome').hidden=Boolean($('messages').children.length);$('artifact').hidden=mode!=='edit' || !$('xml').value;
}
function setMode(next){
  if(busy || next===mode || !MODES[next])return;
  modeViews[mode]={nodes:[...$('messages').childNodes],draft:$('prompt').value};
  mode=next;actionProgress=undefined;
  $('messages').replaceChildren(...modeViews[mode].nodes);$('prompt').value=modeViews[mode].draft;
  status('');renderMode();$('prompt').focus();
}
let detectedInstance=null;
function updateConnectionActions(showStatus=false){
  $('salesforceLogin').hidden=showStatus || Boolean(detectedInstance);
  $('headerConnect').hidden=showStatus || !detectedInstance;
}
function detectSalesforceTab(tab){
  let detected=null;
  try{detected=instanceFromTabUrl(tab.url);}catch{/* Non-web tabs have no instance. */}
  detectedInstance=detected;
  updateConnectionActions(!$('connectionBadge').hidden);
  if(!detected){$('instanceHint').textContent='Log in to Salesforce to detect your instance, or enter its URL manually.';return;}
  const previous=$('instance').value.trim();
  $('instance').value=detected;
  $('instanceHint').textContent='Detected from your Salesforce tab. You can edit this URL if needed.';
  if(previous && previous!==detected){
    config=undefined;loaded=undefined;$('token').value='';$('xml').value='';$('download').disabled=true;$('artifact').hidden=true;
    connectionCheck++;connectionState('','Connect Salesforce');
    status('Detected a different Salesforce instance. Connect Salesforce and save settings to continue.');
  }
}
function beginProgress(steps=EDIT_STEPS,title){$('welcome').hidden=true;actionProgress=new ActionProgress($('messages'),steps,title);}
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function message(role,text){
  $('welcome').hidden=true;
  const node=document.createElement('article');node.className=`message${role==='You'?' user':''}`;
  const avatar=document.createElement('span');avatar.className='message-avatar';avatar.textContent=role==='You'?'Y':'✧';avatar.setAttribute('aria-hidden','true');
  const body=document.createElement('div');body.className='message-body';
  const label=document.createElement('p');label.className='message-role';label.textContent=role==='Claude'?'Flow Studio':role;
  const badge=document.createElement('span');badge.className='message-mode';badge.textContent=mode==='understand'?'Understand':'Edit';label.append(badge);
  const content=document.createElement('div');content.className='message-text';
  if(role==='Claude' && mode==='understand')renderAnswer(content,text);else content.textContent=text;
  body.append(label,content);node.append(avatar,body);$('messages').append(node);
  node.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function connectionState(state,label,detail=''){
  const showStatus=state==='connected' || state==='checking';
  $('connectionBadge').hidden=!showStatus;updateConnectionActions(showStatus);
  for(const id of ['flowContext','flowSelection'])$(id).hidden=state!=='connected';
  $('connectionBadge').className=`connection-badge ${state}`;$('connectionLabel').textContent=label;
  $('connectionBadge').title=detail;
}
let connectionCheck=0;
async function verifyConnection(){
  const check=++connectionCheck;
  const instance=$('instance').value.trim(),token=$('token').value.trim(),version=$('version').value.trim();
  $('modelLabel').title=$('apiKey').value.trim()?`Configured model: ${$('model').value}. Claude is verified when a prompt succeeds.`:'Add your Claude API key in settings.';
  if(!instance || !token){connectionState('','Not connected');return false;}
  connectionState('checking','Checking connection');
  try{
    if(!instanceFromTabUrl(instance))throw Error('Use a supported Salesforce instance URL.');
    if(!/^\d+\.0$/.test(version))throw Error('Use a valid Salesforce API version.');
    await query({instance:new URL(instance).origin,token,version},'SELECT Id FROM Flow LIMIT 1',{signal:AbortSignal.timeout(12000)});
    if(check!==connectionCheck)return false;
    connectionState('connected','Salesforce connected',`API access verified · ${new URL(instance).hostname}`);
    $('authStatus').textContent='Salesforce API access verified.';return true;
  }catch(error){
    if(check!==connectionCheck)return false;
    connectionState('failed','Connection unavailable',error.message);
    $('authStatus').textContent=error.httpStatus===401?'Your token expired. Connect Salesforce again.':'Could not verify API access. Check your connection and permissions.';
    return false;
  }
}
function configure(raw){
  const url=new URL(raw.instance);
  if(url.protocol!=='https:' || !/(^|\.)(salesforce\.com|force\.com)$/.test(url.hostname) || url.username || url.password) throw Error('Use an HTTPS Salesforce instance URL.');
  if(!/^\d+\.0$/.test(raw.version)) throw Error('Invalid Salesforce API version.');
  if(!raw.token || !raw.apiKey || !raw.model) throw Error('Complete the connection settings first.');
  return {...raw,instance:url.origin};
}
async function run(task){if(busy)return;busy=true;document.body.classList.add('busy');$('conversation').setAttribute('aria-busy','true');for(const id of ['load','send','save','connect','settingsSave','understandMode','editMode'])$(id).disabled=true;try{await task();}catch(error){status(error.message,true);if(actionProgress?.running){if(actionProgress.current==='save')$('artifactStatus').textContent='Autosave needs attention · see activity';actionProgress.fail(error.message,MODES[mode].failureTitle);}if(error.httpStatus===401 || /INVALID_SESSION_ID/.test(error.message))connectionState('failed','Reconnect Salesforce');}finally{busy=false;document.body.classList.remove('busy');$('conversation').setAttribute('aria-busy','false');for(const id of ['load','send','connect','settingsSave','understandMode','editMode'])$(id).disabled=false;$('save').disabled=!loaded || !$('xml').value || $('xml').value===savedXml;$('artifact').hidden=mode!=='edit' || !$('xml').value;}}
async function tabContext(){
  let tab;
  try{tab=await chrome.tabs.get(flowTabId);}catch{}
  let url;
  try{url=new URL(tab?.url);}catch{}
  if(!url || instanceFromTabUrl(url.href)!==config?.instance){
    const name=loaded?.name || rememberedName() || $('flowName').value.trim();
    if(name)return {name,unavailable:true};
    throw Error('Open Salesforce Flow Builder, then click the extension.');
  }
  const candidates=[...url.searchParams.values(),url.pathname,url.hash];
  for(const candidate of [...candidates]){try{const nested=new URL(candidate,url.origin); candidates.push(...nested.searchParams.values());}catch{}}
  const id=candidates.map(s=>s.match(/\b(301[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/)?.[1]).find(Boolean);
  const name=url.searchParams.get('flowApiName') || url.searchParams.get('apiName');
  return {id,name};
}
async function latest(name){return (await query(config,`SELECT Id, VersionNumber, LastModifiedDate FROM Flow WHERE Definition.DeveloperName = '${name}' ORDER BY VersionNumber DESC LIMIT 1`))[0];}
async function readFlow(name){
  const doc=await soap(config,'readMetadata',`<type>Flow</type><fullNames>${escapeXml(name)}</fullNames>`);
  const record=elements(doc,'records')[0];
  if(!record || !value(record,'fullName'))throw Error('Salesforce did not return the requested flow. Check the API name and metadata permissions.');
  const out=document.implementation.createDocument(NS,'Flow');
  for(const child of record.children)if(child.localName!=='fullName')out.documentElement.append(out.importNode(child,true));
  return new XMLSerializer().serializeToString(out);
}
$('settingsForm').addEventListener('submit',async event=>{
  event.preventDefault();run(async()=>{config=configure(Object.fromEntries(['instance','token','apiKey','model','version'].map(id=>[id,$(id).value.trim()])));await chrome.storage.local.set({config,salesforceConnection:{instance:config.instance,token:config.token},oauthClientId:$('clientId').value.trim()});loaded=undefined;$('xml').value='';$('download').disabled=true;$('flowInfo').textContent='Use the flow open in Salesforce';const connected=await verifyConnection();$('settings').open=!connected;status(connected?'Settings saved. Describe a change to get started.':'Settings saved. Check the Salesforce connection before continuing.');});
});
$('connect').addEventListener('click',()=>run(async()=>{
  status('Opening Salesforce sign-in…');
  const connection=await connectSalesforce($('instance').value.trim(),$('clientId').value.trim());
  config=undefined;loaded=undefined;$('xml').value='';$('download').disabled=true;$('flowInfo').textContent='No flow loaded';
  $('instance').value=connection.instance;$('token').value=connection.token;
  await chrome.storage.local.set({salesforceConnection:connection});
  await chrome.storage.local.set({oauthClientId:$('clientId').value.trim()});
  const connected=await verifyConnection();
  if($('apiKey').value.trim()){
    config=configure(Object.fromEntries(['instance','token','apiKey','model','version'].map(id=>[id,$(id).value.trim()])));
    await chrome.storage.local.set({config});$('settings').open=!connected;
    status(connected?'Salesforce connected. Describe a change to get started.':'Sign-in saved. Check your Salesforce API access before continuing.');
  }else status(connected?'Salesforce connected. Enter your Claude API key and save the connection.':'Sign-in saved. Check your Salesforce API access and add your Claude key.');
}));
async function loadFlow(){
  if(!config)throw Error('Complete the connection settings first.');
  actionProgress?.start('load','Finding the flow in your Salesforce tab…');
  status('Finding the opened flow…');const context=await tabContext();
  let name=$('flowName').value.trim() || context.name;
  if(context.id && !name){const records=await query(config,`SELECT Id, Definition.DeveloperName FROM Flow WHERE Id = '${context.id}'`);name=records[0]?.Definition?.DeveloperName;}
  if(!name || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))throw Error('Could not detect the flow. Enter its Flow API name and click Load.');
  const current=context.unavailable?await reopenFlow(name):await latest(name);
  if(!current)throw Error('Flow not found in the configured Salesforce org.');
  if(context.id && !current.Id.startsWith(context.id.slice(0,15)))throw Error('The opened flow is an older version. Open the latest version before editing.');
  actionProgress?.update(`Reading ${name}, version ${current.VersionNumber}, from Salesforce…`);
  status('Fetching flow XML through Salesforce Metadata API…');const xml=await readFlow(name);
  const after=await latest(name);if(after.Id!==current.Id || after.LastModifiedDate!==current.LastModifiedDate)throw Error('Flow changed during retrieval. Load it again.');
  loaded={name,xml,current};savedXml='';$('xml').value='';$('artifact').hidden=true;$('download').disabled=true;
  await rememberFlow(name);
  $('flowName').value=name;$('flowInfo').textContent=`${name} · version ${current.VersionNumber} · ${config.instance}`;status(mode==='understand'?'Flow loaded. Ask your first question.':'Flow loaded. Describe the change you want.');
  connectionState('connected','Salesforce connected',`API access verified · ${new URL(config.instance).hostname}`);
  $('load').textContent='Reload';
  actionProgress?.done('load',`${name} · version ${current.VersionNumber} loaded`);
}
$('load').addEventListener('click',()=>run(loadFlow));
$('chatForm').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!config){$('settings').open=true;throw Error('Connect Salesforce and add your Claude key in settings to get started.');}
  const {pendingDeployment}=await chrome.storage.local.get('pendingDeployment');
  if(mode==='edit' && pendingDeployment && pendingDeployment.instance===config.instance){
    await monitor(pendingDeployment.id);
    status('The previous draft was recovered and opened. Send your prompt to make the next change.');return;
  }
  const prompt=$('prompt').value.trim();if(!prompt)throw Error('Enter a prompt.');
  const requestMode=mode,copy=MODES[requestMode];
  message('You',prompt);beginProgress(requestMode==='understand'?UNDERSTAND_STEPS:EDIT_STEPS,copy.progressTitle);
  if(!loaded)await loadFlow();
  else{await ensureFlowTab();actionProgress.done('load',`Using ${loaded.name} · version ${loaded.current.VersionNumber} already in context`);}
  actionProgress.start('generate',requestMode==='understand'?'Sending your question and flow XML to Claude…':'Sending your edit prompt and flow XML to Claude…');
  const source=mode==='edit' && $('xml').value?draftXml($('xml').value):loaded.xml;
  const flowKey=`${config.instance}:${loaded.name}:${loaded.current.Id}:${loaded.current.LastModifiedDate}`;
  if(understandFlowKey!==flowKey){understandHistory=[];understandFlowKey=flowKey;}
  status(copy.status);
  actionProgress.update(copy.progressDetail);
  const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':config.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify(flowRequest(requestMode,{model:config.model,name:loaded.name,xml:source,prompt,history:understandHistory}))});
  const data=await response.json();if(!response.ok)throw Error(data.error?.message || `Claude HTTP ${response.status}`);
  if(data.stop_reason!=='end_turn')throw Error(mode==='understand'?`The answer was cut short (${data.stop_reason}). Try a more specific question.`:`Claude did not finish (${data.stop_reason}). No XML saved; use a model with sufficient output capacity or a smaller flow.`);
  let answer=(data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim();
  if(!answer)throw Error('Claude returned an empty response. Try again.');
  if(requestMode==='understand'){
    understandHistory.push({role:'user',content:prompt},{role:'assistant',content:answer});understandHistory=understandHistory.slice(-12);
    actionProgress.done('generate','Answer grounded in the loaded flow XML.');
    actionProgress.finish('Your answer is ready',`${loaded.name} · version ${loaded.current.VersionNumber} · no changes saved`);
    message('Claude',answer);$('prompt').value='';
    status('Ask a follow-up, or switch to Edit to make a change.');return;
  }
  if(requestMode!=='edit' || mode!=='edit')throw Error('Flow changes require Edit mode.');
  if(answer.startsWith('NEEDS_CLARIFICATION:')){actionProgress.finish('A little more detail is needed','Claude has a question before changing your flow.','paused');message('Claude',answer);status('Clarify your request and send again.');return;}
  actionProgress.done('generate','Claude returned the updated flow XML.');
  actionProgress.start('validate','Checking XML structure and preparing a draft…');
  answer=answer.replace(/^```(?:xml)?\s*/i,'').replace(/\s*```$/,'');
  $('xml').value=draftXml(answer);$('artifact').hidden=false;$('download').disabled=false;message('Claude','I’ve updated the flow. Saving a new draft version to Salesforce…');$('prompt').value='';
  actionProgress.done('validate','XML is well formed; flow namespace and draft status checked.');
  $('artifactStatus').textContent='Saving a new draft version…';
  await saveDraft();
});});
$('save').addEventListener('click',()=>run(saveDraft));
async function saveDraft(){
  if(mode!=='edit')throw Error('Switch to Edit mode to save a flow change.');
  if(!loaded)throw Error('Load a flow first.');
  if(!actionProgress?.running)beginProgress(EDIT_STEPS.slice(3),'Saving your flow');
  actionProgress.start('save','Checking for changes in Salesforce before saving…');
  const {pendingDeployment}=await chrome.storage.local.get('pendingDeployment');
  if(pendingDeployment && pendingDeployment.instance===config.instance){await monitor(pendingDeployment.id);return;}
  const xml=draftXml($('xml').value),current=await latest(loaded.name);
  if(current.Id!==loaded.current.Id || current.LastModifiedDate!==loaded.current.LastModifiedDate)throw Error('The flow changed in Salesforce. Load it again before saving.');
  const archive=zip({'package.xml':`<?xml version="1.0" encoding="UTF-8"?><Package xmlns="${NS}"><types><members>${escapeXml(loaded.name)}</members><name>Flow</name></types><version>${config.version}</version></Package>`,[`flows/${loaded.name}.flow`]:xml});
  status('Submitting draft deployment…');
  actionProgress.update('Uploading the draft. Salesforce will validate and save the flow…');
  const submitted=await soap(config,'deploy',`<ZipFile>${base64(archive)}</ZipFile><DeployOptions><allowMissingFiles>false</allowMissingFiles><autoUpdatePackage>false</autoUpdatePackage><checkOnly>false</checkOnly><ignoreWarnings>false</ignoreWarnings><performRetrieve>false</performRetrieve><purgeOnDelete>false</purgeOnDelete><rollbackOnError>true</rollbackOnError><singlePackage>true</singlePackage><testLevel>NoTestRun</testLevel></DeployOptions>`);
  const id=value(submitted,'id');if(!id)throw Error('Salesforce returned no deployment ID.');
  await chrome.storage.local.set({pendingDeployment:{id,instance:config.instance,name:loaded.name,previousVersion:Number(current.VersionNumber),previousId:current.Id,sourceTabId:flowTabId,xml}});
  await monitor(id);
}
async function openSavedVersion(result,id){
  actionProgress?.done('save','Salesforce deployment completed successfully.');
  actionProgress?.start('verify','Finding the latest available flow version…');
  const {pendingDeployment:stored}=await chrome.storage.local.get('pendingDeployment');
  const pending=stored?.id===id?stored:null;
  const instance=pending?.instance || config.instance;
  if(pending)await rememberFlow(pending.name);
  let saved,lookupError;
  if(pending){
    try{
      for(let attempt=0;attempt<3;attempt++){
        const versions=await query(config,`SELECT Id, VersionNumber, LastModifiedDate FROM Flow WHERE Definition.DeveloperName = '${pending.name}' ORDER BY VersionNumber DESC LIMIT 1`);
        saved=versions[0];
        if(saved && /^301[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(saved.Id))break;
        saved=undefined;
        if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }catch(error){lookupError=error.message;}
  }
  // Deployment succeeded even if lookup or navigation fails. Never submit it again.
  savedXml=pending?.xml || $('xml').value;
  await chrome.storage.local.set({lastSavedFlow:{id:saved?.Id || null,name:pending?.name || null,version:saved?.VersionNumber || null,instance,deploymentId:id}});
  await chrome.storage.local.remove('pendingDeployment');
  loaded=undefined;
  if(saved){
    try{loaded={name:pending.name,xml:await readFlow(pending.name),current:saved};}catch{/* Reload before the next request if XML cannot be refreshed. */}
    $('flowInfo').textContent=`${pending.name} · version ${saved.VersionNumber} · ${instance}`;
  }
  actionProgress?.done('verify',saved?`Latest available version: ${saved.VersionNumber}`:`Could not find the flow version${lookupError?`: ${lookupError}`:''}. Opening the flow list.`);
  actionProgress?.start('open',saved?'Opening the latest version in Salesforce Flow Builder…':'Opening the Salesforce Setup flow list…');
  let target;
  try{target=await chrome.tabs.get(pending?.sourceTabId ?? flowTabId);}catch{/* Use a new tab when the source tab is unavailable. */}
  let reuse=false,origin=instance;
  try{if(target?.url && instanceFromTabUrl(target.url)===instance){reuse=true;origin=new URL(target.url).origin;}}catch{}
  const listUrl=new URL('/lightning/setup/Flows/home',origin).href;
  async function navigate(url){
    const opened=reuse?await chrome.tabs.update(target.id,{url,active:true}):await chrome.tabs.create({url,active:true});
    flowTabId=opened.id;
  }
  let openedFlow=false;
  if(saved){
    const builder=new URL('/builder_platform_interaction/flowBuilder.app',origin);builder.searchParams.set('flowId',saved.Id);
    try{await navigate(builder.href);openedFlow=true;}catch{/* Fall back to Setup if Flow Builder cannot be opened. */}
  }
  if(!openedFlow){
    try{await navigate(listUrl);}catch{
      try{const tab=await chrome.tabs.create({url:listUrl,active:true});flowTabId=tab.id;}
      catch(error){
        $('artifactStatus').textContent='Flow saved · open Salesforce Setup manually';
        throw Error(`The flow was saved, but the browser could not open Salesforce: ${error.message}. Open ${listUrl}`);
      }
    }
  }
  $('artifactStatus').textContent=openedFlow?`Flow saved · latest version ${saved.VersionNumber} opened`:'Flow saved · Salesforce Setup flow list opened';
  actionProgress?.done('open',openedFlow?`Version ${saved.VersionNumber} is open in Salesforce.`:'Salesforce Setup flow list is open.');
  actionProgress?.finish('Your flow is saved',openedFlow?'Opened the latest available version in Flow Builder.':'Opened the flow list in Salesforce Setup.');
  $('save').disabled=true;$('save').textContent='Flow saved';
  const detail=openedFlow?`Saved the flow and opened the latest available version (${saved.VersionNumber}).`:'Saved the flow and opened the flow list in Salesforce Setup.';
  message('Salesforce',detail);status(`${detail} Deployment ID: ${id}.`);
}

async function monitor(id){
  if(!actionProgress?.running){beginProgress(EDIT_STEPS.slice(3),'Resuming your Salesforce save');actionProgress.start('save','Checking the previous deployment…');}
  for(let i=0;i<120;i++){
    status(`Salesforce deployment ${id} is running. Keep this window open.`);
    const result=await soap(config,'checkDeployStatus',`<asyncProcessId>${escapeXml(id)}</asyncProcessId><includeDetails>true</includeDetails>`);
    const deployStatus=value(result,'status');
    actionProgress?.update(deployStatus?`Salesforce deployment: ${deployStatus}. Waiting for completion…`:'Salesforce is validating and saving the draft…');
    if(value(result,'done')==='true'){
      if(value(result,'success')!=='true'){
        await chrome.storage.local.remove('pendingDeployment');
        throw Error(elements(result,'componentFailures').map(n=>`${value(n,'fullName')}: ${value(n,'problem')}`).join('\n') || value(result,'errorMessage') || `Deployment ${value(result,'status')}`);
      }
      await openSavedVersion(result,id);return;
    }
    await new Promise(resolve=>setTimeout(resolve,2500));
  }
  throw Error(`Deployment ${id} is still pending. Reopen the extension to resume checking; do not submit it again.`);
}
$('download').addEventListener('click',()=>{try{const blob=new Blob([draftXml($('xml').value)],{type:'application/xml'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${loaded?.name || 'Flow'}.flow-meta.xml`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){status(error.message,true);}});
async function init(){
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await migrateSessionSettings();
  $('callbackUrl').value=oauthRedirectUrl();
  const {oauthClientId}=await chrome.storage.local.get('oauthClientId');$('clientId').value=oauthClientId || '';
  let {salesforceConnection}=await chrome.storage.local.get('salesforceConnection');
  if(salesforceConnection){$('instance').value=salesforceConnection.instance;$('token').value=salesforceConnection.token;}
  const saved=await chrome.storage.local.get('config');if(saved.config){config=configure(saved.config);for(const id of ['instance','token','apiKey','model','version'])$(id).value=config[id];}
  // Restore a newer sign-in while preserving the saved Claude settings.
  if(salesforceConnection){
    $('instance').value=salesforceConnection.instance;$('token').value=salesforceConnection.token;
    if(config){config={...config,...salesforceConnection};await chrome.storage.local.set({config});}
  }
  try {
    const tab=await chrome.tabs.get(tabId);
    detectSalesforceTab(tab);
  } catch {
    detectSalesforceTab({});
  }
  const {pendingDeployment}=await chrome.storage.local.get('pendingDeployment');
  const connected=await verifyConnection();
  const {flowContext}=await chrome.storage.local.get('flowContext');
  if(flowContext?.instance===config?.instance && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(flowContext.name))rememberedFlow=flowContext;
  if(pendingDeployment && config?.instance===pendingDeployment.instance){setMode('edit');await run(()=>monitor(pendingDeployment.id));}
  else if(config && connected){
    try{const context=await tabContext();if(context.id || context.name)await run(loadFlow);}catch{/* Manual selection remains available. */}
  }
  if(!$('settings').open)$('prompt').focus();
}
$('settingsToggle').addEventListener('click',()=>{$('settings').open=!$('settings').open;});
$('headerConnect').addEventListener('click',()=>{$('settings').open=true;$('instance').focus();});
$('salesforceLogin').addEventListener('click',async()=>{
  try{
    const tab=await chrome.tabs.create({url:'https://login.salesforce.com/'});
    flowTabId=tab.id;
    status('Sign in to Salesforce. Your instance will be detected when the Salesforce page opens.');
  }catch(error){status(error.message,true);}
});
chrome.tabs.onUpdated.addListener((id,change,tab)=>{
  if(id===flowTabId && (change.url || change.status==='complete'))detectSalesforceTab(tab);
});
$('settings').addEventListener('toggle',()=>{for(const id of ['settingsToggle','headerConnect'])$(id).setAttribute('aria-expanded',String($('settings').open));});
$('understandMode').addEventListener('click',()=>setMode('understand'));
$('editMode').addEventListener('click',()=>setMode('edit'));
$('suggestions').addEventListener('click',event=>{const button=event.target.closest('[data-prompt]');if(!button)return;$('prompt').value=button.dataset.prompt;$('prompt').focus();});
$('prompt').addEventListener('keydown',event=>{if(event.key==='Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing){event.preventDefault();$('chatForm').requestSubmit();}});
$('xml').addEventListener('input',()=>{$('save').disabled=busy || !loaded || !$('xml').value || $('xml').value===savedXml;$('save').textContent='Save edited XML as new version';});
for(const id of ['instance','token','version'])$(id).addEventListener('input',()=>{connectionCheck++;connectionState('','Settings changed','Save settings to verify this connection.');});
renderMode();
init().catch(error=>status(error.message,true));


