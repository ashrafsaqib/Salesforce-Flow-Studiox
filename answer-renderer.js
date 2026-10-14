// A small DOM-only renderer. Model output never becomes HTML.
function inline(parent,text){
  const pattern=/(\*\*([^*]+)\*\*|`([^`]+)`)/g;let start=0;
  for(const match of text.matchAll(pattern)){
    parent.append(document.createTextNode(text.slice(start,match.index)));
    const element=document.createElement(match[2]?'strong':'code');element.textContent=match[2] || match[3];parent.append(element);start=match.index+match[0].length;
  }
  parent.append(document.createTextNode(text.slice(start)));
}
export function renderAnswer(container,text){
  container.classList.add('answer-content');let list=null,paragraph=null,code=null;
  for(const line of text.split('\n')){
    if(line.trim().startsWith('```')){
      if(code){code=null;}else{const pre=document.createElement('pre');code=document.createElement('code');pre.append(code);container.append(pre);}
      list=null;paragraph=null;continue;
    }
    if(code){code.textContent+=line+'\n';continue;}
    if(!line.trim()){list=null;paragraph=null;continue;}
    const heading=line.match(/^#{1,4}\s+(.+)$/),item=line.match(/^\s*(?:([-*])|\d+[.)])\s+(.+)$/);
    if(heading){const node=document.createElement('h3');inline(node,heading[1]);container.append(node);list=null;paragraph=null;}
    else if(item){
      const tag=item[1]?'ul':'ol';if(!list || list.localName!==tag){list=document.createElement(tag);container.append(list);}
      const node=document.createElement('li');inline(node,item[2]);list.append(node);paragraph=null;
    }else{
      list=null;if(!paragraph){paragraph=document.createElement('p');container.append(paragraph);}else paragraph.append(document.createTextNode(' '));inline(paragraph,line);
    }
  }
}
