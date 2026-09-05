import type { ClaudeImportPreview, ImportedConversation } from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { acceptClaudeImport, errorMessage, previewClaudeImport } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/**
 * Importing her Claude conversations (M11, `docs/agents/M11-claude-import.md`).
 *
 * Three stages on one screen: choose the export, review what it holds, see
 * what landed. The review is the product. Every conversation with her own
 * words in it is a proposal she assigns to a person — or skips — and can
 * trim before it becomes a note; the people themselves are proposals too,
 * pre-ticked when they are patients she already has. Nothing is written
 * until the one button at the bottom, and it says how many.
 *
 * What Claude replied is shown on request and never imported: her words are
 * the record.
 */

/** The select value for "this is not about a patient". */
const SKIP = '';

interface PersonRow {
  readonly key: string;
  readonly name: string;
  readonly patientId: string | null;
  readonly include: boolean;
}

interface ProposalRow {
  readonly conversation: ImportedConversation;
  readonly person: string;
  readonly text: string;
  readonly showAssistant: boolean;
}

interface Landed {
  readonly notes: number;
  readonly patients: number;
  readonly created: number;
}

export function Import(): React.JSX.Element {
  useDocumentTitle('Import from Claude');
  const [preview, setPreview] = useState<ClaudeImportPreview | null>(null);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [landed, setLanded] = useState<Landed | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await previewClaudeImport(file);
      setPreview(result);
      setPeople(
        result.candidates.map((candidate) => ({
          key: candidate.name,
          name: candidate.name,
          patientId: candidate.patient_id,
          include: true,
        })),
      );
      setRows(
        result.conversations.map((conversation) => ({
          conversation,
          person: conversation.people[0] ?? SKIP,
          text: conversation.human_text,
          showAssistant: false,
        })),
      );
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  const included = new Map(people.filter((person) => person.include).map((person) => [person.key, person]));
  const chosen = rows.filter((row) => included.has(row.person) && row.text.trim() !== '');

  async function accept(): Promise<void> {
    if (chosen.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await acceptClaudeImport({
        items: chosen.map((row) => {
          const person = included.get(row.person) as PersonRow;
          return {
            conversation_id: row.conversation.id,
            patient_id: person.patientId,
            patient_name: person.name.trim(),
            title: row.conversation.title,
            recorded_at: row.conversation.recorded_at,
            text: row.text.trim(),
          };
        }),
      });
      setLanded({
        notes: result.notes_created,
        patients: result.patient_ids.length,
        created: result.patients_created,
      });
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  function updatePerson(key: string, patch: Partial<PersonRow>): void {
    setPeople((current) => current.map((person) => (person.key === key ? { ...person, ...patch } : person)));
  }

  function updateRow(id: string, patch: Partial<ProposalRow>): void {
    setRows((current) => current.map((row) => (row.conversation.id === id ? { ...row, ...patch } : row)));
  }

  if (landed !== null) {
    return (
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">Imported</h2>
        <p className="lede" data-testid="import-done">
          {landed.notes} {landed.notes === 1 ? 'note' : 'notes'} for {landed.patients}{' '}
          {landed.patients === 1 ? 'patient' : 'patients'}
          {landed.created > 0 ? ` (${String(landed.created)} new)` : ''}. Each is a draft, dated when you
          talked to Claude, with your words as its transcript.
        </p>
        <Link to="/" className="btn">
          Go to patients
        </Link>
      </Screen>
    );
  }

  if (preview === null) {
    return (
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">Import from Claude</h2>
        <p className="muted lede">
          Bring the sessions you have talked through with Claude into Apunta as patients and notes — after you
          have looked at each one.
        </p>
        <div className="card card-rows lede">
          <p className="small note-meta">
            In Claude, open Settings → Privacy → Export data. The export arrives by email as a zip. Choose
            that file here, or the conversations.json inside it.
          </p>
          <p className="small note-meta">
            It is read on this Mac and kept nowhere: the file is gone the moment the proposals are on screen,
            and nothing is written until you accept it below.
          </p>
          <input
            type="file"
            accept=".zip,.json,application/zip,application/json"
            data-testid="import-file"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void choose(file);
            }}
          />
          {busy && <p className="small state-note">Reading the export…</p>}
          {error !== null && (
            <p className="form-error" role="alert" data-testid="import-error">
              {error}
            </p>
          )}
        </div>
      </Screen>
    );
  }

  const { totals, date_range: range } = preview;
  return (
    <Screen back={{ to: '/settings', label: 'Settings' }}>
      <h2 className="heading-tight">Review before anything is written</h2>
      <p className="small note-meta lede" data-testid="import-summary">
        {totals.conversations} conversations
        {range.from === null ? '' : `, ${day(range.from)} to ${day(range.to)}`}. {rows.length} with your own
        words in them
        {totals.skipped > 0 ? `; ${String(totals.skipped)} with nothing to read` : ''}.
      </p>

      <div className="card card-rows lede">
        <h3 className="heading-tight">Who these may be about</h3>
        <p className="small note-meta">
          Names that keep coming up. Tick the ones that are patients, fix any spelling, and untick the rest —
          a name is only ever a guess until you say so.
        </p>
        {people.length === 0 && <p className="small muted">No recurring names were found.</p>}
        {people.map((person) => (
          <div className="row gap-8" key={person.key} data-testid="import-person">
            <input
              type="checkbox"
              checked={person.include}
              onChange={(event) => {
                updatePerson(person.key, { include: event.target.checked });
              }}
              aria-label={`Import ${person.key} as a patient`}
            />
            <input
              type="text"
              value={person.name}
              disabled={person.patientId !== null}
              onChange={(event) => {
                updatePerson(person.key, { name: event.target.value });
              }}
              aria-label={`Name for ${person.key}`}
            />
            <span className="small muted">
              {person.patientId !== null ? 'already a patient' : 'new patient'}
            </span>
          </div>
        ))}
      </div>

      {rows.map((row) => (
        <div className="card card-rows lede" key={row.conversation.id} data-testid="import-proposal">
          <div className="row between">
            <strong>
              {row.conversation.title.trim() === '' ? 'Untitled conversation' : row.conversation.title}
            </strong>
            <span className="small muted">
              {row.conversation.recorded_at === null
                ? 'undated'
                : `recorded ${day(row.conversation.recorded_at)}`}
            </span>
          </div>
          <label className="small note-meta">
            Note for{' '}
            <select
              value={row.person}
              onChange={(event) => {
                updateRow(row.conversation.id, { person: event.target.value });
              }}
              data-testid="import-person-select"
            >
              <option value={SKIP}>nobody — skip this one</option>
              {people
                .filter((person) => person.include)
                .map((person) => (
                  <option key={person.key} value={person.key}>
                    {person.name}
                  </option>
                ))}
            </select>
          </label>
          <textarea
            rows={6}
            value={row.text}
            onChange={(event) => {
              updateRow(row.conversation.id, { text: event.target.value });
            }}
            aria-label="Your words, as the note will read"
          />
          {row.conversation.assistant_text !== '' && (
            <details
              open={row.showAssistant}
              onToggle={(event) => {
                updateRow(row.conversation.id, { showAssistant: (event.target as HTMLDetailsElement).open });
              }}
            >
              <summary className="small muted">What Claude replied — shown, never imported</summary>
              <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>
                {row.conversation.assistant_text}
              </p>
            </details>
          )}
        </div>
      ))}

      {error !== null && (
        <p className="form-error" role="alert" data-testid="import-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-block"
        disabled={chosen.length === 0 || busy}
        onClick={() => {
          void accept();
        }}
        data-testid="import-accept"
      >
        {busy ? 'Importing…' : `Import ${String(chosen.length)} ${chosen.length === 1 ? 'note' : 'notes'}`}
      </button>
      <p className="small note-meta">
        Nothing is written until you press that. Skipped conversations are simply left where they are.
      </p>
    </Screen>
  );
}

function day(iso: string | null): string {
  return iso === null ? '' : iso.slice(0, 10);
}
