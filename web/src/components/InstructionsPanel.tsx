import { approximateTokens, SKILL_TOKEN_BUDGET, type SkillFlattenResponse } from '@apunta/shared';
import { useState } from 'react';

import { errorMessage, flattenSkill } from '../api/index.js';
import { useI18n, useReportWork } from '../lib/i18n.js';

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
  const { t } = useI18n();
  const [importing, setImporting] = useState(false);
  // Flattening a skill holds the Language control (C-LANG@1 rule 6).
  useReportWork(importing);
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
      <span className="label">{t('format.instructions')}</span>
      <p className="small note-meta">
        {t('format.instructionsHelp')} <code>docs/skill-porting.md</code> {t('format.instructionsHelpTail')}
      </p>

      <textarea
        id="format-instructions"
        aria-label={t('format.instructions')}
        className="instructions-textarea"
        rows={10}
        value={value}
        disabled={disabled === true}
        placeholder={t('format.instructionsPlaceholder')}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />

      {value.trim() !== '' && (
        <p className="small note-meta" data-testid="instructions-budget">
          {tokens > SKILL_TOKEN_BUDGET
            ? t('format.tokensLarge', { tokens, budget: SKILL_TOKEN_BUDGET })
            : t('format.tokensOk', { tokens })}
        </p>
      )}

      <label className="btn small btn-compact import-skill" htmlFor="skill-file">
        {importing ? t('format.readingSkill') : t('format.importFromSkill')}
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
        {t('format.skillFileLead')} <code>SKILL.md</code> {t('format.skillFileAnd')} <code>.zip</code>{' '}
        {t('format.skillFileTail')}
      </p>

      {imported !== null && (
        <div className="import-report" data-testid="import-report">
          <p className="small">
            {[
              imported.removed.frontmatter ? t('format.reportFrontmatter') : null,
              imported.removed.commandBlocks > 0
                ? t('format.reportCommandBlocks', { count: imported.removed.commandBlocks })
                : null,
              imported.removed.toolLines > 0
                ? t('format.reportToolLines', { count: imported.removed.toolLines })
                : null,
              imported.removed.mechanics > 0
                ? t('format.reportClaudeLines', { count: imported.removed.mechanics })
                : null,
              imported.removed.emptiedHeadings > 0
                ? t('format.reportEmptiedHeadings', { count: imported.removed.emptiedHeadings })
                : null,
            ]
              .filter((part) => part !== null)
              .join(' · ') || t('format.reportNothing')}
          </p>
          <p className="small">{t('format.reportReadFirst')}</p>

          {imported.referencedFiles.length > 0 && (
            <p className="small warn-note" data-testid="import-references" role="alert">
              {t('format.referencedFiles', { files: imported.referencedFiles.join(', ') })}
            </p>
          )}

          <p className="small warn-note">{t('format.instructionsWarning')}</p>
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
