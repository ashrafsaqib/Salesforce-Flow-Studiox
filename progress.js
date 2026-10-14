export const EDIT_STEPS = [
  ['load','Read your flow'], ['generate','Apply your prompt'],
  ['validate','Check the XML'], ['save','Save a new draft'],
  ['verify','Find the latest version'], ['open','Open in Salesforce']
];

const node = (tag, className, text) => {
  const element=document.createElement(tag);element.className=className;
  if(text!==undefined)element.textContent=text;return element;
};

export class ActionProgress {
  constructor(container, steps=EDIT_STEPS, title='Working on your flow') {
    this.running=true;this.started=Date.now();this.current=null;this.entries=new Map();
    this.card=node('article','activity-card');this.card.setAttribute('aria-label',title);
    const header=node('div','activity-header');this.orb=node('span','activity-orb');this.orb.setAttribute('aria-hidden','true');
    const copy=node('div','activity-copy');this.title=node('strong','activity-title',title);
    this.subtitle=node('p','activity-subtitle','Preparing your request…');this.subtitle.setAttribute('role','status');
    copy.append(this.title,this.subtitle);this.clock=node('span','activity-clock','0s');header.append(this.orb,copy,this.clock);
    const track=node('div','activity-track');track.setAttribute('aria-hidden','true');
    const detail=node('details','activity-details');
    const summary=node('summary','activity-summary');summary.append(node('span','','View activity'));
    this.count=node('span','activity-count',`0 of ${steps.length} complete`);summary.append(this.count);detail.append(summary);
    const list=node('ol','activity-list');
    for(const [key,label] of steps){
      const segment=node('span','activity-segment');track.append(segment);
      const row=node('li','activity-step');row.dataset.state='pending';
      const icon=node('span','step-icon','');icon.setAttribute('aria-hidden','true');
      const body=node('div','step-body');body.append(node('strong','step-label',label));
      const description=node('p','step-description','Waiting');body.append(description);
      const state=node('span','step-state','Queued');row.append(icon,body,state);list.append(row);
      this.entries.set(key,{row,segment,icon,description,state});
    }
    detail.append(list);this.card.append(header,track,detail);container.append(this.card);
    this.timer=setInterval(()=>this.clock.textContent=this.elapsed(),1000);
    this.card.scrollIntoView({block:'nearest'});
  }
  elapsed(){const seconds=Math.floor((Date.now()-this.started)/1000);return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;}
  start(key,text){
    if(!this.running || !this.entries.has(key))return;
    this.current=key;const entry=this.entries.get(key);entry.started=Date.now();
    this.set(entry,'running',text,'Running');this.subtitle.textContent=text;
    this.card.dataset.stage=key;
  }
  update(text){
    if(!this.running)return;
    this.subtitle.textContent=text;
    if(this.current)this.entries.get(this.current).description.textContent=text;
  }
  set(entry,state,text,label){
    entry.row.dataset.state=state;entry.segment.dataset.state=state;
    entry.description.textContent=text;entry.state.textContent=label;
    entry.icon.textContent=state==='done'?'✓':state==='error'?'!':state==='paused'?'?':'';
    const completed=[...this.entries.values()].filter(item=>item.row.dataset.state==='done').length;
    this.count.textContent=`${completed} of ${this.entries.size} complete`;
  }
  done(key,text){
    if(!this.running || !this.entries.has(key))return;
    const entry=this.entries.get(key),duration=entry.started?`${((Date.now()-entry.started)/1000).toFixed(1)}s`:'Ready';
    this.set(entry,'done',text,duration);
    if(this.current===key)this.current=null;
  }
  finish(title,text,state='success'){
    if(!this.running)return;
    if(this.current && state!=='success')this.set(this.entries.get(this.current),state==='error'?'error':'paused',text,state==='error'?'Failed':'Needs input');
    this.running=false;clearInterval(this.timer);this.clock.textContent=this.elapsed();
    this.card.dataset.state=state;this.title.textContent=title;this.subtitle.textContent=text;
    this.orb.textContent=state==='success'?'✓':state==='error'?'!':'?';
    if(state==='error')this.card.querySelector('details').open=true;
    for(const entry of this.entries.values())if(entry.row.dataset.state==='pending')entry.state.textContent=state==='success'?'Skipped':'Not run';
  }
  fail(text,title='Could not finish this request'){this.finish(title,text,'error');}
}
