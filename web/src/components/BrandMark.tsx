/**
 * The Apunta A mark: outlines inlined from
 * `docs/v2/assets/apunta-a.fraunces.currentcolor.svg` (Fraunces Medium at text
 * optical size, SIL OFL; same source font and licence as the wordmark, same
 * no-font-in-the-bundle rule).
 *
 * Decorative — the wordmark or the page title already names the app — so it is
 * `aria-hidden`. Sized in `em` so it tracks the text it stands beside, and
 * coloured by `--brand-mark`, which follows the accent (D10 as amended
 * 2026-09-26).
 */
export interface BrandMarkProps {
  className?: string | undefined;
}

export function BrandMark({ className }: BrandMarkProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 1419 1440"
      aria-hidden="true"
      focusable="false"
      style={{
        color: 'var(--brand-mark)',
        display: 'inline-block',
        flexShrink: 0,
        height: '0.8em',
        width: 'auto',
      }}
    >
      <path
        fill="currentColor"
        transform="translate(-10.0 1420.0) scale(1 -1)"
        d="M347 563H940L946 468H339ZM453 41Q453 23 439.5 11.5Q426 0 397 0H86Q57 0 43.5 11.0Q30 22 30 41Q30 54 38.0 63.5Q46 73 68 83L103 96Q133 110 148.5 132.5Q164 155 182 213L518 1228Q531 1268 524.5 1285.5Q518 1303 482 1313Q455 1322 444.0 1333.0Q433 1344 433 1360Q433 1379 447.0 1389.5Q461 1400 489 1400H940Q969 1400 982.0 1389.5Q995 1379 995 1360Q995 1343 984.5 1332.0Q974 1321 948 1314Q920 1307 915.0 1293.5Q910 1280 920 1249L1276 187Q1290 142 1308.5 120.0Q1327 98 1361 89Q1389 79 1399.0 68.5Q1409 58 1409 41Q1409 23 1395.0 11.5Q1381 0 1352 0H933Q905 0 891.0 11.5Q877 23 877 41Q877 57 887.0 67.0Q897 77 918 83L982 94Q1008 101 1008.0 118.5Q1008 136 995 174L627 1294L658 1311L301 226Q289 187 289.0 162.5Q289 138 304.5 122.5Q320 107 353 95L412 82Q433 75 443.0 66.0Q453 57 453 41Z"
      />
    </svg>
  );
}
