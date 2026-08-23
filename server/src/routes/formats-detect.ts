import {
  approximateTokens,
  DetectKindSchema,
  MAX_DETECT_FILES,
  SectionsSchema,
  type DetectFormatResponse,
  type DetectKind,
  type SkillFlattenResponse,
} from '@apunta/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AiProviders } from '../ai/types.js';
import { concatenateForDetection } from '../extract/concat.js';
import { ExtractError, extractDocument } from '../extract/index.js';
import { badRequest } from '../http/errors.js';
import { flattenSkill } from '../skill/flatten.js';
import { readSkillMarkdown } from '../skill/zip.js';

/**
 * Format onboarding from files (M6 deliverables 2 and 5).
 *
 * **These routes are given no `Database` handle, on purpose.** An uploaded
 * template is a workplace document and an uploaded example note is a clinical
 * record; neither may be persisted, and neither is. Making that a type error
 * rather than a review comment is the cheapest guarantee available — if a
 * later change wants to write a row here, it has to add a parameter first and
 * explain why.
 *
 * Nothing on this path logs file content, file names, or extracted text. The
 * errors carry a category and copy; the responses carry counts.
 */
export function registerFormatDetectRoutes(app: FastifyInstance, providers: AiProviders): void {
  /**
   * `POST /api/formats/detect` — 1–3 files plus `kind`, in, `{name, sections}`
   * out. Nothing is saved; the therapist confirms on the next screen and that
   * screen calls `POST /api/formats`.
   */
  app.post('/api/formats/detect', async (request): Promise<DetectFormatResponse> =>
    asClientErrors(MAX_DETECT_FILES, async () => {
      const upload = await readUpload(request, MAX_DETECT_FILES);

      const kindField = DetectKindSchema.safeParse(upload.fields['kind']);
      if (!kindField.success) {
        throw badRequest('Tell Apunta whether these are a blank template or completed notes.');
      }
      const kind: DetectKind = kindField.data;

      if (upload.files.length === 0) throw badRequest('Choose a file to read the format from.');
      if (kind === 'examples' && upload.files.length < 2) {
        throw badRequest('Upload 2 or 3 completed notes so Apunta can see what they have in common.');
      }

      const texts: string[] = [];
      for (const buffer of upload.files) {
        texts.push((await extractDocument(buffer)).text);
      }

      const { text, truncated } = concatenateForDetection(kind, texts);
      const detected = await providers.llm.detectFormat({ kind, text });

      // The provider already validates against `DetectedFormatSchema`; this is
      // the format contract's own rule — section names are JSON keys, so two
      // that differ only in case would collapse into one and silently lose a
      // section. A model that returns them is a bad answer, not a 500.
      const sections = SectionsSchema.safeParse(detected.sections);
      if (!sections.success) {
        throw badRequest(
          "Apunta read the file but couldn't make a usable format out of it. Try describing the sections yourself.",
        );
      }

      return {
        name: detected.name,
        sections: sections.data,
        files: upload.files.length,
        truncated,
      };
    }),
  );

  /**
   * `POST /api/formats/flatten-skill` — a `SKILL.md` (or a `.zip` containing
   * one) in, the mechanically flattened body out, for review in the textarea.
   * It is never saved here: saving is a `PATCH /api/formats/:id` the therapist
   * makes after reading what the flattener did.
   */
  app.post('/api/formats/flatten-skill', async (request): Promise<SkillFlattenResponse> =>
    asClientErrors(1, async () => {
      const upload = await readUpload(request, 1);
      const file = upload.files[0];
      if (file === undefined) throw badRequest('Choose a SKILL.md file, or a .zip of the skill folder.');

      const flattened = flattenSkill(readSkillMarkdown(file));
      return {
        instructions: flattened.instructions.slice(0, 50_000),
        removed: flattened.removed,
        referencedFiles: [...flattened.referencedFiles].slice(0, 50),
        approxTokens: approximateTokens(flattened.instructions),
      };
    }),
  );
}

interface Upload {
  readonly files: readonly Buffer[];
  readonly fields: Readonly<Record<string, string>>;
}

/**
 * Read a multipart request into memory.
 *
 * `request.parts()` and `part.toBuffer()`, never `saveRequestFiles()` or
 * `part.toFile()` — those write the upload to a temp directory, and a
 * clinical note on disk outside the database is exactly what this app must
 * not produce. An ESLint rule holds the two names out of `server/`.
 */
async function readUpload(request: FastifyRequest, maxFiles: number): Promise<Upload> {
  const files: Buffer[] = [];
  const fields: Record<string, string> = {};
  let tooMany = false;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      // An over-limit file is drained and discarded rather than thrown on
      // immediately: abandoning the iterator mid-part destroys the stream
      // under `@fastify/multipart` and the request dies as
      // `ERR_STREAM_PREMATURE_CLOSE`, which is a 500 and tells the person
      // uploading nothing. Draining costs one bounded buffer — `fileSize`
      // still caps it at 10 MB — and buys an accurate message below.
      const buffer = await part.toBuffer();
      if (files.length >= maxFiles) tooMany = true;
      else files.push(buffer);
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }

  if (tooMany) throw tooManyFiles(maxFiles);
  return { files, fields };
}

function tooManyFiles(maxFiles: number) {
  return badRequest(
    maxFiles === 1 ? 'Upload one file at a time.' : `Upload at most ${String(maxFiles)} files at once.`,
  );
}

/**
 * Run a handler, turning every upload failure into a 400 with copy.
 *
 * Extraction and multipart failures are all things the person uploading can
 * fix, so none of them is a 500 with a framework message — and none of the
 * messages is derived from the file's bytes or its name.
 */
async function asClientErrors<T>(maxFiles: number, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ExtractError) throw badRequest(error.message);

    const code = (error as { code?: unknown }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') {
      throw badRequest(
        "That file is larger than 10 MB. If it's a scan, Apunta can't read it anyway — it does no OCR.",
      );
    }
    if (code === 'FST_FILES_LIMIT' || code === 'FST_PARTS_LIMIT' || code === 'FST_FIELDS_LIMIT') {
      throw tooManyFiles(maxFiles);
    }
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      throw badRequest('Upload the file with the form on the previous screen.');
    }
    throw error;
  }
}
