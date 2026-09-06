import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

test('model response path contains no dynamic code execution',()=>{
  for(const file of ['src/engine/aaravClient.ts','src/engine/aaravToolHandlers.ts','src/components/ui/AaravChat.tsx'])
    assert.doesNotMatch(readFileSync(file,'utf8'),/\beval\s*\(|\bnew\s+Function\s*\(|\bimport\s*\(/,file);
});
test('assistant text is rendered with React text escaping and no HTML injection sink',()=>{
  function scan(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())scan(p);else if(/\.tsx?$/.test(p))assert.doesNotMatch(readFileSync(p,'utf8'),/dangerouslySetInnerHTML|\.innerHTML\s*=/,p);}}
  scan('src');assert.match(readFileSync('src/components/ui/AaravChat.tsx','utf8'),/\{textOf\(message.content\)\}/);
});
test('environment files ignore secrets and example contains only placeholders',()=>{
  assert.match(readFileSync('.gitignore','utf8'),/^\.env\r?$/m);
  const example=readFileSync('.env.example','utf8');assert.match(example,/^ANTHROPIC_API_KEY=\s*$/m);
  assert.doesNotMatch(example,/sk-ant-[A-Za-z0-9_-]{20,}/);
});
