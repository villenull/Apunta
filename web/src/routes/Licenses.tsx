import { useCallback, useMemo, useState } from 'react';

import { fetchLicenses } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLoader } from '../hooks/useLoader.js';
import { copyText } from '../lib/clipboard.js';

interface LicenseSection {
  id: string;
  title: string;
  text: string;
}

function sectionsFrom(text: string): LicenseSection[] {
  const sections: LicenseSection[] = [];
  const preamble: string[] = [];
  let current: { title: string; lines: string[] } | null = null;
  for (const line of text.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.push(toSection(current));
      current = { title: heading[1]!, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(toSection(current));
  if (preamble.length > 0) {
    sections.unshift({ id: 'license-overview', title: 'Overview', text: preamble.join('\n') });
  }
  return sections;
}

function toSection(section: { title: string; lines: string[] }): LicenseSection {
  const id = `license-${section.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
  return { id, title: section.title, text: section.lines.join('\n') };
}

/**
 * The licences of everything Apunta ships (M8 deliverable 6).
 *
 * The legal text remains verbatim. The surrounding index and filter only
 * choose which complete sections are visible, so no renderer can reinterpret
 * a licence's punctuation or Markdown.
 */
export function Licenses(): React.JSX.Element {
  useDocumentTitle('Licences');
  const load = useCallback((signal: AbortSignal) => fetchLicenses(signal), []);
  const licenses = useLoader(load);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  const sections = useMemo(
    () => (licenses.state.status === 'ready' ? sectionsFrom(licenses.state.data) : []),
    [licenses.state],
  );
  const visibleSections = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return sections;
    return sections.filter((section) => section.text.toLowerCase().includes(needle));
  }, [filter, sections]);

  const handleCopy = useCallback(async () => {
    if (licenses.state.status !== 'ready') return;
    await copyText(licenses.state.data);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1200);
  }, [licenses.state]);

  return (
    <Screen back={{ to: '/about', label: 'About' }}>
      <h2 className="lede">What Apunta is built from</h2>

      <div className="card card-rows lede">
        <p className="small note-meta">
          Apunta includes programs written by other people, and their licences ask that this notice travels
          with the app. Nothing here needs anything from you — it is here because it should be.
        </p>
      </div>

      {licenses.state.status === 'loading' && <p className="small note-meta lede">Loading…</p>}

      {licenses.state.status === 'error' && (
        <p className="form-error lede" role="alert">
          {licenses.state.message}
        </p>
      )}

      {licenses.state.status === 'ready' && (
        <section className="licenses-panel lede" aria-label="Third-party licences">
          <div className="licenses-toolbar">
            <label className="field-label" htmlFor="license-filter">
              Filter licences
            </label>
            <input
              id="license-filter"
              className="field-input"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
              placeholder="Filter by component or text"
            />
            <button type="button" className="btn btn-quick" onClick={() => void handleCopy()}>
              {copied ? 'Copied' : 'Copy plain text'}
            </button>
          </div>
          <nav className="licenses-index" aria-label="Licence components">
            {visibleSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
          <div className="licenses-sections">
            {visibleSections.length === 0 ? (
              <p className="small note-meta">No licence text matches “{filter.trim()}”.</p>
            ) : (
              visibleSections.map((section) => (
                <pre className="licenses-text" id={section.id} key={section.id}>
                  {section.text}
                </pre>
              ))
            )}
          </div>
        </section>
      )}
    </Screen>
  );
}
