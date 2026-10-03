import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const toolDir = process.env['APUNTA_TOOL_DIR'] ?? dirname(fileURLToPath(import.meta.url));
// Locates docs/v2 by walking up from this file, so the reproduction runs from
// either the committed evidence path or the ignored build/ scratch copy.
const here = dirname(fileURLToPath(import.meta.url));
let realPlan = process.env['APUNTA_V2_PLAN_DIR_REAL'];
if (realPlan === undefined) {
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'docs', 'v2', 'templates'))) { realPlan = join(dir, 'docs', 'v2'); break; }
    dir = dirname(dir);
  }
}
if (realPlan === undefined) throw new Error('docs/v2 not found; set APUNTA_V2_PLAN_DIR_REAL');

function makePlan(cardText, id) {
  const dir = mkdtempSync(join(tmpdir(), 'apunta-ft-'));
  for (const f of ['CONTRACTS.md','HARD-STOPS.md','RUN-CONFIG.md']) cpSync(join(realPlan,f), join(dir,f));
  cpSync(join(realPlan,'templates'), join(dir,'templates'), {recursive:true});
  mkdirSync(join(dir,'cards'), {recursive:true}); mkdirSync(join(dir,'state'), {recursive:true});
  writeFileSync(join(dir,'CONTRACTS.md'), '# Contracts\n');
  writeFileSync(join(dir,'HARD-STOPS.md'), '# Hard stops\n');
  writeFileSync(join(dir,'RUN-CONFIG.md'), '# Run config\n');
  writeFileSync(join(dir,'MILESTONES.md'), '# Milestones\n\n| T0.R | T0 | Test review | L2 | extra checks |\n');
  writeFileSync(join(dir,'state','PROGRESS.json'), JSON.stringify({cards:{[id]:'APPROVED'}}));
  writeFileSync(join(dir,'cards',`${id}.md`), cardText);
  return dir;
}
const cardText = (h1) => `# ${h1} Test card

| Field | Value |
| --- | --- |
| Parent | T0 |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | none |
| Depends | none |
| Findings | none |
| Confidence | high |

## Objective

Say one thing.

## Verification

| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | \`npm run lint\` | ok |
`;
const gen = (dir,args)=>spawnSync(process.execPath,[join(toolDir,'build-dispatch.mjs'),...args],{encoding:'utf8',env:{...process.env,APUNTA_V2_PLAN_DIR:dir}});

// Case A: §T.2 as written -- file name P3.4.md, H1 still "# T1 Test card"
const a = makePlan(cardText('T1'), 'P3.4');
const ra = gen(a,['P3.4','--base','deadbeef','--port','7841','--attempt','5','--attempt-exception','AM-999','--print']);
console.log('A) file=P3.4.md H1="# T1 Test card" ->', ra.status, JSON.stringify((ra.stderr||'').split('\n').filter(l=>l.includes('Error')||l.includes('must be')).slice(0,2)));

// Case B: H1 matched to the id
const b = makePlan(cardText('P3.4'), 'P3.4');
const rb = gen(b,['P3.4','--base','deadbeef','--port','7841','--attempt','5','--attempt-exception','AM-999','--print']);
console.log('B) file=P3.4.md H1="# P3.4 Test card" ->', rb.status, (rb.stdout||'').split('\n').find(l=>l.includes('Attempt 5')));

// Case C: the same shape with the default id T1 (existing tests)
const c = makePlan(cardText('T1'), 'T1');
const rc = gen(c,['T1','--base','deadbeef','--port','7841','--attempt','4','--attempt-exception','AM-049','--print']);
console.log('C) file=T1.md H1="# T1 Test card" ->', rc.status, (rc.stdout||'').split('\n').find(l=>l.includes('Attempt 4')));
