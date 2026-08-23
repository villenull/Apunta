import { approximateTokens, SKILL_TOKEN_BUDGET, type SkillFlattenResponse } from '@apunta/shared';
import { useState } from 'react';

import { errorMessage, flattenSkill } from '../api/index.js';

/**
 * The drafting instructions for one format (M6 deliverable 4), plus the
 * "Import from skill file" affordance (deliverable 5).
 *
 * `note_formats.instructions` becomes the system prompt for every draft
 * written in this format, and an empty value means "use the built-in default"
 * — which carries the faithfulness rule and no section guidance. That is why
 * the panel says so rather than presenting an empty box.
 *
 * The import is mechanical and partial by design. It runs the line-level steps
 * of `docs/skill-porting.md`, reports a count for each, and puts the result in
 * the textarea **for review**. It never saves, never inlines a referenced
 * file, and never adds the few-shot pairs the recipe asks for — those are
 * judgement, and a flattener that pretended otherwise would be worse than one
 * that admits it.
 */
export interface InstructionsPanelProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function InstructionsPanel({ value, onChange, disabled }: InstructionsPanelProps): React.JSX.Element {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<SkillFlattenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setImporting(true);
    setError(null);
    try {
      const flattened = await flattenSkill(file);
      setImported(flattened);
      onChange(flattened.instructions);
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setImporting(false);
    }
  }

  const tokens = approximateTokens(value);

  return (
    <div className="card lede" data-testid="instructions-panel">
      <span className="label">Instructions</span>
      <p className="small note-meta">
        What the local model is told about writing this format. Paste flattened skill instructions here; leave
        blank to use the built-in default. The recipe for flattening a Claude skill is in{' '}
        <code>docs/skill-porting.md</code> in the Apunta folder.
      </p>

      <textarea
        id="format-instructions"
        aria-label="Instructions"
        className="instructions-textarea"
        rows={10}
        value={value}
        disabled={disabled === true}
        placeholder="Leave blank to use the built-in default."
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />

      {value.trim() !== '' && (
        <p className="small note-meta" data-testid="instructions-budget">
          {tokens > SKILL_TOKEN_BUDGET
            ? `≈${tokens.toLocaleString()} tokens — small models start to drift past about ${SKILL_TOKEN_BUDGET.toLocaleString()}.`
            : `≈${tokens.toLocaleString()} tokens — comfortable.`}
        </p>
      )}

      <label className="btn small btn-compact import-skill" htmlFor="skill-file">
        {importing ? 'Reading the skill…' : 'Import from skill file'}
        <input
          id="skill-file"
          type="file"
          className="visually-hidden"
          accept=".md,.zip"
          data-testid="skill-file-input"
          disabled={disabled === true || importing}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
          }}
        />
      </label>
      <p className="small note-meta">
        A <code>SKILL.md</code>, or a <code>.zip</code> of the skill folder. Nothing is saved until you press
        save.
      </p>

      {imported !== null && (
        <div className="import-report" data-testid="import-report">
          <p className="small">
            {[
              imported.removed.frontmatter ? 'frontmatter removed' : null,
              imported.removed.commandBlocks > 0
                ? `${String(imported.removed.commandBlocks)} command block${imported.removed.commandBlocks === 1 ? '' : 's'} dropped`
                : null,
              imported.removed.toolLines > 0
                ? `${String(imported.removed.toolLines)} tool line${imported.removed.toolLines === 1 ? '' : 's'} dropped`
                : null,
              imported.removed.mechanics > 0
                ? `${String(imported.removed.mechanics)} Claude-specific line${imported.removed.mechanics === 1 ? '' : 's'} dropped`
                : null,
              imported.removed.emptiedHeadings > 0
                ? `${String(imported.removed.emptiedHeadings)} emptied heading${imported.removed.emptiedHeadings === 1 ? '' : 's'} dropped`
                : null,
            ]
              .filter((part) => part !== null)
              .join(' · ') || 'nothing needed removing'}
          </p>
          <p className="small">Read it through before you save — these rules over-delete on some skills.</p>

          {imported.referencedFiles.length > 0 && (
            <p className="small warn-note" data-testid="import-references" role="alert">
              This skill refers to {imported.referencedFiles.join(', ')}, which Apunta cannot read. If those
              files hold section definitions or terminology, paste that text in yourself.
            </p>
          )}

          <p className="small warn-note">
            This text is saved and is sent to the AI with every note you write. Check it doesn&apos;t contain
            real client details before you save.
          </p>
        </div>
      )}

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
