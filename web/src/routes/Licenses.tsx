import { useCallback, useMemo, useState } from 'react';

import { fetchLicenses } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLoader } from '../hooks/useLoader.js';
import { copyText } from '../lib/clipboard.js';
import { useI18n } from '../lib/i18n.js';

interface LicenseSection {
  id: string;
  title: string;
  text: string;
}

/**
 * The preamble gets a heading of its own, `Licenses.tsx:32`.
 *
 * It is a catalogue key rather than a literal: the checker reads a `title`
 * property (it is one of the four names in `VISIBLE_PROPERTIES`) even though
 * the heading then goes into an `<h2>`, and it is the only string in the file
 * that lives outside the component.
 */
function sectionsFrom(text: string, overview: string): LicenseSection[] {
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
    sections.unshift({ id: 'license-overview', title: overview, text: preamble.join('\n') });
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
  const { t } = useI18n();
  useDocumentTitle(t('doc.licences'));
  const load = useCallback((signal: AbortSignal) => fetchLicenses(signal), []);
  const licenses = useLoader(load);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

  const sections = useMemo(
    () =>
      licenses.state.status === 'ready' ? sectionsFrom(licenses.state.data, t('licenses.overview')) : [],
    [licenses.state, t],
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
    <Screen back={{ to: '/about', label: t('doc.about') }}>
      <h2 className="lede">{t('licenses.builtFrom')}</h2>

      <div className="card card-rows lede">
        <p className="small note-meta">{t('licenses.lede')}</p>
      </div>

      {licenses.state.status === 'loading' && <p className="small note-meta lede">{t('common.loading')}</p>}

      {licenses.state.status === 'error' && (
        <p className="form-error lede" role="alert">
          {licenses.state.message}
        </p>
      )}

      {licenses.state.status === 'ready' && (
        <section className="licenses-panel lede" aria-label={t('licenses.panelLabel')}>
          <div className="licenses-toolbar">
            <label className="field-label" htmlFor="license-filter">
              {t('licenses.filterLabel')}
            </label>
            <input
              id="license-filter"
              className="field-input"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
              placeholder={t('licenses.filterPlaceholder')}
            />
            <button type="button" className="btn btn-quick" onClick={() => void handleCopy()}>
              {copied ? t('common.copied') : t('licenses.copyPlain')}
            </button>
          </div>
          <nav className="licenses-index" aria-label={t('licenses.componentsLabel')}>
            {visibleSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </nav>
          <div className="licenses-sections">
            {visibleSections.length === 0 ? (
              <p className="small note-meta">{t('licenses.noMatch', { filter: filter.trim() })}</p>
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
