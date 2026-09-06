import { spawnSync } from 'node:child_process';
const result=spawnSync(process.execPath,['--import','tsx','--test',...process.argv.slice(2),'tests/physical-runtime.test.mjs'],
  {stdio:'inherit',env:{...process.env,AARAV_EXECUTING_GPU:'1'}});
process.exit(result.status??1);
