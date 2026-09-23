import { useCallback } from 'react';
import { Link } from 'react-router';

import { fetchHealth } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/**
 * About and privacy: the local-only guarantee in plain language, and the two
 * places it stops. The copy deliberately says "this computer" because Apunta
 * runs on more than one operating system.
 */
export function About(): React.JSX.Element {
  useDocumentTitle('About');
  const load = useCallback((signal: AbortSignal) => fetchHealth(signal), []);
  const health = useLoader(load);
  const data = health.state.status === 'ready' ? health.state.data : null;

  return (
    <Screen back={{ to: '/', label: 'Patients' }}>
      <h2 className="lede">About Apunta</h2>

      <div className="card card-rows lede">
        <h3 className="heading-tight">Nothing you write here goes onto the internet</h3>
        <p className="small note-meta">
          Apunta runs on this computer. It is a web page served by a program on the same computer, and the app
          makes no outbound network connections. There is no account and no remote copy.
        </p>
        <p className="small note-meta">
          The writing model and transcription model run locally too. Your recording is read by a program on
          this computer and is never uploaded. Apunta does not use the browser&apos;s built-in speech
          recognition, because that can send audio to a third party.
        </p>
        <p className="small note-meta">
          There is no analytics, crash reporting, update check, or anonymous usage data.
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">Where your notes actually are</h3>
        <p className="small note-meta">
          One folder on this computer, holding one file:
          {data === null ? ' loading…' : ''}
        </p>
        {data !== null && (
          <p className="setup-fix-steps" data-testid="about-db-path">
            {data.db.path}
          </p>
        )}
        <p className="small note-meta">
          That file is your drafting history. It is not your clinical record — the record lives in whatever
          system you paste the finished note into. It is still worth backing up, because the rough notes, the
          transcripts and the refine and brainstorm conversations exist nowhere else.{' '}
          <Link to="/settings">Settings</Link> has &ldquo;Backup&rdquo;.
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">The two things this does not protect you from</h3>
        <p className="small note-meta">
          <strong>Someone at your unlocked computer.</strong> Apunta has no password of its own. Anyone
          sitting at this computer while you are logged in can open it and read everything. Locking the screen
          when you walk away is the real answer.
        </p>
        <p className="small note-meta">
          <strong>A stolen computer with an unencrypted disk.</strong> Disk encryption protects a lost
          computer from disclosure. Its status is shown below only when the operating system can report it.
        </p>
        {data !== null && <FileVaultLine state={data.fileVault.state} detail={data.fileVault.detail} />}
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">What it does with the AI</h3>
        <p className="small note-meta">
          When you create a draft, the model receives what you dictated or typed and the shape of your note
          format. Refine and brainstorm can also include relevant prior notes when they are used as
          background. It is asked to write only what is in front of it. It still makes mistakes, so every
          draft is yours to read before you publish it.
        </p>
        <p className="small note-meta">
          Where the recording was unclear, the draft says so in the text rather than guessing.
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">What Apunta is built from</h3>
        <p className="small note-meta">
          The AI that writes and the program that reads your recordings were written by other people and are
          included inside Apunta. Their licences ask that the notice travels with the app:{' '}
          <Link to="/licenses">the licences are here</Link>.
        </p>
        <p className="small note-meta">
          The AI models themselves are not part of Apunta. They are installed on this computer under their own
          terms, and Apunta does not pass them on.
        </p>
      </div>

      <p className="small note-meta lede">
        Missing pieces and what to run: <Link to="/setup">Setup</Link>.
      </p>
    </Screen>
  );
}

function FileVaultLine({ state, detail }: { state: string; detail: string }): React.JSX.Element {
  if (state === 'not_applicable') {
    return (
      <p className="small note-meta" data-testid="about-filevault">
        Disk encryption: <strong>not checked</strong> on this operating system. {detail}
      </p>
    );
  }
  if (state === 'on') {
    return (
      <p className="small note-meta" data-testid="about-filevault">
        Disk encryption: <strong>ready</strong>. {detail}
      </p>
    );
  }
  if (state === 'off' || state === 'deferred') {
    return (
      <p className="form-error" role="alert" data-testid="about-filevault">
        Disk encryption: <strong>not ready</strong>. Turn it on in System Settings → Privacy &amp; Security →
        FileVault before real notes go in, and keep the recovery key somewhere other than this computer.
      </p>
    );
  }
  return (
    <p className="small note-meta" data-testid="about-filevault">
      Disk encryption: <strong>not checked</strong>. Apunta could not read its status; check it yourself in
      the operating system&apos;s security settings. {detail}
    </p>
  );
}
