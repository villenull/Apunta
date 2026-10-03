const before = (attempt, exception, id) =>
    `- Attempt ${attempt} of ${attempt === 4 ? '3, plus one corrective attempt the owner authorised by ' + exception + ' — there is no attempt 5' : '3'}. Checkpoint: \`docs/v2/state/cards/${id}.json\`.`;
const after = (attempt, exception, id) =>
    `- Attempt ${attempt} of ${
      attempt === 4
        ? '3, plus one corrective attempt the owner authorised by ' + exception + ' — there is no attempt 5'
        : attempt === 5
          ? '3, plus two corrective attempts the owner authorised by ' + exception + ' — there is no attempt 6'
          : '3'
    }. Checkpoint: \`docs/v2/state/cards/${id}.json\`.`;
const arith = (attempt, exception, id) =>
    `- Attempt ${attempt} of ${attempt === 4 ? `3, plus ${attempt - 3} corrective attempt(s) the owner authorised by ${exception} — there is no attempt ${attempt + 1}` : '3'}. Checkpoint: \`docs/v2/state/cards/${id}.json\`.`;
for (const [a,e,i] of [[4,'AM-049','P3.4'],[5,'AM-190','P3.4'],[3,undefined,'P3.4'],[1,undefined,'T1'],[2,undefined,'T1']]) {
  console.log(`attempt=${a} exception=${e}`);
  console.log('  before :', before(a,e,i));
  console.log('  after  :', after(a,e,i));
  console.log('  arith  :', arith(a,e,i));
  console.log('  before===after:', before(a,e,i)===after(a,e,i), ' before===arith:', before(a,e,i)===arith(a,e,i));
}
