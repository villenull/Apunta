import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pages = [
  [
    'Halaxy Clinical Notes',
    'Patient: John Smith',
    '12/03/2026 - Intake',
    'John described difficulty settling after a recent change at work.',
    'We mapped a short evening routine and agreed to review it next session.',
    'Page 1 of 3',
  ],
  [
    'Halaxy Clinical Notes',
    'Patient: John Smith',
    '12 March 2026 - Review',
    'John reported that the evening routine helped on three nights.',
    'He noticed the strongest effect when the phone was left outside the bedroom.',
    'The plan was continued with a small adjustment to the reminder time.',
    'Page 2 of 3',
  ],
  [
    'Halaxy Clinical Notes',
    'Patient: John Smith',
    'The review continued after this page break.',
    'We also identified a practical barrier: late public transport made the routine harder.',
    '18/03/2026 - Follow-up',
    'John chose to prepare the reminder before leaving work and will bring his notes.',
    'Page 3 of 3',
  ],
];

function pdfString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

function pageContent(lines) {
  return lines
    .map((line, index) => `BT /F1 11 Tf 72 ${760 - index * 22} Td (${pdfString(line)}) Tj ET`)
    .join('\n');
}

function makePdf() {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesObject = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const contentIds = [];
  for (const lines of pages) {
    const content = pageContent(lines);
    contentIds.push(add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`));
    pageIds.push(add(''));
  }
  objects[pagesObject - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  pageIds.forEach((id, index) => {
    objects[id - 1] = `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });
  const chunks = ['%PDF-1.4\n'];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(chunks.join('')));
    chunks.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const startXref = Buffer.byteLength(chunks.join(''));
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let index = 1; index < offsets.length; index += 1) chunks.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);
  return Buffer.from(chunks.join(''));
}

const output = join(dirname(new URL(import.meta.url).pathname), '..', 'e2e', 'fixtures', 'halaxy', 'john-smith.pdf');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, makePdf());
console.log(`Wrote synthetic Halaxy fixture (${pages.length} pages)`);
