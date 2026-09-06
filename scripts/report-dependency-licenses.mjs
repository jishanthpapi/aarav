import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const old=JSON.parse(readFileSync('imports/before-files-14/package.json','utf8'));
const current=JSON.parse(readFileSync('package.json','utf8'));
const previous={...old.dependencies,...old.devDependencies};
const added=Object.keys({...current.dependencies,...current.devDependencies}).filter(n=>!previous[n]);
const permissive=new Set(['MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC','CC0-1.0','Unlicense']);
const entries=Object.entries(lock.packages).filter(([path])=>path).map(([path,item])=>{
  const manifest=join(path,'package.json');
  const installed=existsSync(manifest)?JSON.parse(readFileSync(manifest,'utf8')):null;
  let license=installed?.license??item.license??'UNKNOWN';
  let licenseSource=installed?.license?'installed package.json':'package-lock.json';
  if(path==='node_modules/webgl-constants' && readFileSync(join(path,'LICENSE'),'utf8').startsWith('MIT License')) {
    license='MIT';licenseSource='installed LICENSE text';
  }
  const licenseFiles=installed?readdirSync(path).filter(f=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(f)):[];
  return {path,name:installed?.name??path.split('node_modules/').at(-1),version:item.version,license,licenseSource,
    installed:!!installed,licenseFiles:licenseFiles.map(f=>join(path,f).replaceAll('\\','/')),
    disposition:permissive.has(license)?'Permissive; retain copyright, license and applicable NOTICE text.':
      license==='CC-BY-4.0'?'Data attribution required; retain author, source, license and changes notice.':'REVIEW REQUIRED'};
});
writeFileSync('docs/dependency-licenses.json',JSON.stringify({date:'2026-09-06',projectLicense:'MIT',newDirectDependencies:added,
  scope:'Installed package manifests and lockfile licenses. No dependency versions changed in this security task.',
  note:'Project source remains MIT. Third-party works retain their own licenses; Apache-2.0 patent/NOTICE and CC-BY attribution obligations still apply.',entries},null,2)+'\n');
const notices=entries.filter(e=>e.installed).map(e=>{
  const texts=e.licenseFiles.filter(p=>/licen[cs]e|notice/i.test(p)).map(p=>readFileSync(p,'utf8'));
  return `## ${e.name} ${e.version}\n\nLicense: ${e.license}\nSource: ${e.path}\n\n${texts.join('\n\n')||'See package distribution for copyright/license notices.'}`;
});
writeFileSync('docs/THIRD-PARTY-NOTICES.txt',notices.join('\n\n')+'\n');
console.log(JSON.stringify({newDirectDependencies:added,packages:entries.length,reviewRequired:entries.filter(e=>e.disposition==='REVIEW REQUIRED'),attribution:entries.filter(e=>e.license==='CC-BY-4.0')},null,2));
