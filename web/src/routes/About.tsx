import { useCallback } from 'react';
import { Link } from 'react-router';

import { fetchHealth } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/**
 * About and privacy (M7 deliverable 5) — the local-only guarantee in plain
 * language, and the two places it stops.
 *
 * The point of this page is that it does not overclaim. "Nothing leaves this
 * Mac" is true of the network and is *not* the whole story about the disk:
 * without FileVault, anyone who takes the laptop reads every note without
 * knowing a password, and a backup saved into Documents is uploaded to Apple.
 * Both are stated here rather than left to the setup screen, because this is
 * the page someone reads when they want to know whether to trust it
 * (`docs/research/data-at-rest-2026-08.md` §4.2, §2.5).
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
        <h3 className="heading-tight">Nothing you write here goes anywhere</h3>
        <p className="small note-meta">
          Apunta runs on this Mac and only on this Mac. The part of it you are looking at is a web page, but
          it is being served by a program on this computer — nothing is being sent over the internet, and
          there is no account, no server, and nobody else with a copy.
        </p>
        <p className="small note-meta">
          The writing is done by an AI model that was downloaded onto this Mac and runs on it. Transcription
          is the same: your recording is read by a program on this computer and is never uploaded. Apunta
          deliberately does not use the browser&rsquo;s built-in speech recognition, because on most browsers
          that sends the audio to Google.
        </p>
        <p className="small note-meta">
          There is no analytics, no crash reporting, no update check, and no &ldquo;anonymous usage
          data&rdquo;. The program is not allowed to make an outbound connection at all; if some future change
          tried to, it would fail rather than succeed quietly.
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">Where your notes actually are</h3>
        <p className="small note-meta">
          One folder on this Mac, holding one file:
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
          transcripts and the refine conversations exist nowhere else. <Link to="/settings">Settings</Link>{' '}
          has &ldquo;Backup&rdquo;.
        </p>
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">The two things this does not protect you from</h3>
        <p className="small note-meta">
          <strong>Someone at your unlocked Mac.</strong> Apunta has no password of its own. Anyone sitting at
          this computer while you are logged in can open it and read everything. Locking the screen when you
          walk away is the real answer, and if anyone else uses this Mac, a separate macOS account for the
          practice is a bigger improvement than anything in this app.
        </p>
        <p className="small note-meta">
          <strong>A stolen Mac with the disk unencrypted.</strong> FileVault is macOS&rsquo;s disk encryption,
          and it is what makes a lost laptop a lost laptop rather than a disclosure. It is not on by default
          on every Mac.
        </p>
        {data !== null && <FileVaultLine state={data.fileVault.state} detail={data.fileVault.detail} />}
      </div>

      <div className="card card-rows lede">
        <h3 className="heading-tight">What it does with the AI</h3>
        <p className="small note-meta">
          The model is given what you dictated or typed, the shape of your note format, and nothing else. It
          is asked to write only what is in front of it. It still makes mistakes, so every draft is yours to
          read before you publish it — an invented sentence in a clinical note looks exactly like a real one.
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
          The AI models themselves are not part of Apunta. Your Mac downloaded them once, from the people who
          made them, under their terms — Apunta keeps no copy of its own and never passes them on.
        </p>
      </div>

      <p className="small note-meta lede">
        Missing pieces and what to run: <Link to="/setup">Setup</Link>.
      </p>
    </Screen>
  );
}

function FileVaultLine({ state, detail }: { state: string; detail: string }): React.JSX.Element {
  if (state === 'on') {
    return (
      <p className="small note-meta" data-testid="about-filevault">
        On this Mac, FileVault is <strong>on</strong>. {detail}
      </p>
    );
  }
  if (state === 'off' || state === 'deferred') {
    return (
      <p className="form-error" role="alert" data-testid="about-filevault">
        On this Mac, FileVault is <strong>not protecting the disk yet</strong>. Turn it on in System Settings
        &rarr; Privacy &amp; Security &rarr; FileVault before real notes go in, and keep the recovery key
        somewhere that is not this Mac.
      </p>
    );
  }
  return (
    <p className="small note-meta" data-testid="about-filevault">
      Apunta could not tell whether FileVault is on. It is worth checking yourself: System Settings &rarr;
      Privacy &amp; Security &rarr; FileVault.
    </p>
  );
}
