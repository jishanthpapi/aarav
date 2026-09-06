import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('production build contains neither the server key name nor key-shaped secrets',{timeout:600000},async()=>{
  const sentinel='sk-ant-api03-'+'TEST_ONLY_NOT_A_REAL_KEY_'.repeat(4);
  let log='';
  const code=await new Promise((resolve,reject)=>{
    const npm=process.env.npm_execpath;
    const build=npm
      ? spawn(process.execPath,[npm,'run','build'],{env:{...process.env,ANTHROPIC_API_KEY:sentinel},stdio:['ignore','pipe','pipe']})
      : spawn('npm run build',{shell:true,env:{...process.env,ANTHROPIC_API_KEY:sentinel},stdio:['ignore','pipe','pipe']});
    build.stdout.on('data',d=>{log+=d;});build.stderr.on('data',d=>{log+=d;});build.on('error',reject);build.on('exit',resolve);
  });
  writeFileSync('docs/security-build-output.txt',log);assert.equal(code,0,log);
  function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())scan(file);else{
    const data=readFileSync(file).toString('utf8');
    assert.ok(!data.includes('ANTHROPIC_API_KEY'),file+' exposes the server key name');
    assert.ok(!data.includes(sentinel),file+' exposes the test key');
    assert.doesNotMatch(data,/sk-ant-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{32,}/,file+' contains a key-shaped string');
  }}}scan('dist');
});
