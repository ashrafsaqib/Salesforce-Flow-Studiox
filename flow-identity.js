export function flowIdentity(name){
  if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))throw Error('Enter a valid Flow API name.');
  const separator=name.indexOf('__');
  const namespace=separator<0?null:name.slice(0,separator);
  const developerName=separator<0?name:name.slice(separator+2);
  if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(developerName))throw Error('Enter a valid Flow API name.');
  return {namespace,developerName};
}

export function flowFilter(name){
  const {namespace,developerName}=flowIdentity(name);
  return `Definition.DeveloperName = '${developerName}' AND Definition.NamespacePrefix = ${namespace?`'${namespace}'`:'null'}`;
}

export function flowApiName(definition){
  if(!definition?.DeveloperName)return undefined;
  return definition.NamespacePrefix?`${definition.NamespacePrefix}__${definition.DeveloperName}`:definition.DeveloperName;
}
