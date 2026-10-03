import fs from 'node:fs';

const root = '/home/villenull/Projects/Apunta';
const read = (p) => fs.readFileSync(`${root}/${p}`, 'utf8');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const ck = JSON.parse(read('docs/v2/state/cards/P3.5.json'));

const objs = ck.sideEffectsDone.filter((e) => e && typeof e === 'object' && !Array.isArray(e));
const anchors = ck.sandboxRuns;
const a4 = objs.filter((e) => e.attempt === 4);
const a4a = anchors.filter((e) => e.attempt === 4);

check('total capture objects == 10', objs.length === 10, `got ${objs.length}`);
check('total anchors == 10', anchors.length === 10, `got ${anchors.length}`);
check('attempt-4 objects == 3 (V3,V4-tone,V4-silence)', a4.length === 3 && a4.map((e) => e.step).join(',') === 'V3,V4-tone,V4-silence', a4.map((e) => e.step).join(','));
check('attempt-4 anchors == 3', a4a.length === 3 && a4a.map((e) => e.step).join(',') === 'V3,V4-tone,V4-silence', a4a.map((e) => e.step).join(','));
check('attempt-1 objects == 5', objs.filter((e) => e.attempt === 1).length === 5);
check('attempt-3 objects == 2', objs.filter((e) => e.attempt === 3).length === 2);
check('priorAttempt4Incomplete.V4 == BLOCKED', ck.priorAttempt4IncompleteCriteria.V4.status === 'BLOCKED');
check('priorAttempt4Incomplete.V5 == FAIL', ck.priorAttempt4IncompleteCriteria.V5.status === 'FAIL');
check('current V4 == PASS', ck.criteria.V4.status === 'PASS');
check('current V5 == PASS', ck.criteria.V5.status === 'PASS');
check('status == SUBMITTED', ck.status === 'SUBMITTED');
check('attempt == 4', ck.attempt === 4);

const sil = a4.find((e) => e.step === 'V4-silence');
check('V4-silence record exists at attempt 4', !!sil, sil ? sil.runId : 'none');
check('V4-silence runId matches RECORD', sil && sil.runId === '2026-10-03T23-21-30-917Z-a17f4bbf');
check('V4-silence dateUtc matches', sil && sil.dateUtc === '2026-10-03T23:21:34.001Z');
check('V4-silence prevDefault is real mic', sil && sil.prevDefault === 'alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo');
check('V4-silence sinkId/srcId present', sil && sil.sinkId === '536870916' && sil.srcId === '536870917');

const card = read('docs/v2/cards/P3.5.md');
const v5cell = card.match(/\| V5 \| `([^`]+)`/)[1];
const v5ev = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/V5.command.txt');
const v5un = v5cell.replace(/\\\|/g, '|').replace(/\\`/g, '`');
check('V5 command byte-equal to card cell (unescaped)', v5un === v5ev.replace(/\n$/, ''), `card ${v5cell.length} raw, ev ${v5ev.length} bytes`);

const comp = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/completion-command.sh');
check('completion command 339 bytes', comp.length === 339, `got ${comp.length}`);

const run = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/02-silence-run.txt');
check('silence run exit 0', /exit_code: 0/.test(run));
check('silence 35/35', /35\/35 assertions passed/.test(run));
check('levelPeak stayed 0', /PASS V4-silence levelPeak stayed 0 for the whole recording/.test(run));
check('phase reached recording', /PASS V4-silence the phase reached recording/.test(run));
check('timer past 10s', /PASS V4-silence the record-timer advanced past 10s/.test(run));
check('capture stream on apunta_p35_mic', /PASS V4-silence a capture stream is present on apunta_p35_mic/.test(run));
check('no capture stream on real mic', /PASS V4-silence no capture stream on the owner's real microphone/.test(run));
check('whisper_model_missing surfaced', /PASS V4-silence the error code is whisper_model_missing/.test(run));
check('GET notes vacuous -1', /GET \/api\/notes was -1 before and -1 after/.test(run));

const v5run = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/10-v5-run.txt');
check('V5 exit 0', /exit_code: 0/.test(v5run));
check('V5 bad=0', /V5 bad=0/.test(v5run));
check('V5 checkpoint hash unchanged', (v5run.match(/527a3a70aeb2d343092bc682921d395463492288f31e465866f354c3da69a207/g) || []).length === 2);
check('V5 ignoring 7 earlier records', /V5 ignoring 7 PREV_DEFAULT record/.test(v5run));
check('V5 live residue all 0', /V5 lines in pactl list short sources holding an exact task name: 0/.test(v5run) && /V5 lines in pactl list short sinks holding an exact task name: 0/.test(v5run));

const prov = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/03-record-and-provenance.txt');
check('durable record byte-equal to RECORD', /BYTE-EQUAL AS OBJECTS/.test(prov));
check('env file 292 bytes', /villenull 292 .*? \/tmp\/apunta-v2-p3.5-v4-silence.env/.test(prov));

const cleanup = read('docs/v2/evidence/P3.5/attempt-4/silence-completion/15-cleanup-verification-final.txt');
check('cleanup: no surviving processes', /AppImage children:\s*\(none\)/.test(cleanup));
check('cleanup: ports free', /ports 7839 and 7837/.test(cleanup) && /grep rc=1/.test(cleanup));
check('cleanup: default source restored', /alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo/.test(cleanup));
check('cleanup: 0 residue', /sources: 0/.test(cleanup) && /sinks: 0/.test(cleanup));
check('cleanup: harness hash unchanged', /85fbb13d5af891d3778eab1c1a167b2bdcb3493b27bf4f156e4832a748924c14/.test(cleanup));
check('cleanup: 7717 never contacted', /7717 never contacted/.test(cleanup));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
