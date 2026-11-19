import type { ReactNode } from 'react';
import type { FuturesChart, PublicShareDto } from '@futuria/shared';
import { FAN } from '@/components/brand';
import { formatPercent } from '@/lib/format';
import { OG_FONT_FAMILY } from '@/lib/og-fonts';
import { clip, fitBox, scalePath } from '@/lib/og';
import { riskLevel } from '@/lib/risk';
import { seriesHex } from '@/lib/series-colors';

/*
 * Social cards (1200 x 630) rendered by next/og (Satori): flexbox only, inline styles, no CSS
 * variables, and every element with more than one child needs `display: flex`. Colours are the
 * dark theme's (globals.css).
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

const C = {
  background: '#03120f',
  surface: '#0a1d1a',
  border: '#183330',
  foreground: '#ecf6f1',
  muted: '#93aba4',
  accent: '#2fe08d',
  grad1: '#0bcf77',
  grad2: '#69d619',
  onBrand: '#03140d',
  danger: '#fca5a5',
  risk: { low: '#6ee7b7', some: '#fcd34d', high: '#fca5a5' },
} as const;

/** Paths listed on a card; more are summed up as "+N more". */
const MAX_LISTED_PATHS = 4;

function Frame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '44px 56px',
        backgroundColor: C.background,
        backgroundImage:
          'radial-gradient(circle at 88% -10%, rgba(11,207,119,0.30), rgba(3,18,15,0) 55%)',
        color: C.foreground,
        fontFamily: OG_FONT_FAMILY,
      }}
    >
      {children}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 13,
          backgroundImage: `linear-gradient(135deg, ${C.grad1}, ${C.grad2})`,
        }}
      >
        <svg width={34} height={34} viewBox="0 0 24 24" fill="none">
          {FAN.map((d) => (
            <path key={d} d={d} stroke={C.onBrand} strokeWidth={2} strokeLinecap="round" />
          ))}
          <circle cx="4" cy="12" r="2.2" fill={C.onBrand} />
        </svg>
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1.2 }}>Futuria</div>
    </div>
  );
}

/** The simulated futures: every line one future, the bold line each path's median. */
function Chart({ chart, width, height }: { chart: FuturesChart; width: number; height: number }) {
  const fit = fitBox(chart, { width, height }, 10);
  const floor = chart.floorY * chart.height * fit.sy + fit.dy;
  const startY = chart.startY * chart.height * fit.sy + fit.dy;
  return (
    <div style={{ display: 'flex', position: 'relative', width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
        {floor < height ? (
          <rect
            x={0}
            y={floor}
            width={width}
            height={height - floor}
            fill="rgba(252,165,165,0.09)"
          />
        ) : null}
        <line
          x1={0}
          x2={width}
          y1={floor}
          y2={floor}
          stroke="rgba(252,165,165,0.55)"
          strokeWidth={2}
        />
        {chart.bundles.map((b) => (
          <path
            key={b.pathId}
            d={scalePath(b.runs, fit)}
            stroke={seriesHex(b.index)}
            strokeOpacity={0.3}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        ))}
        {chart.bundles.map((b) => (
          <path
            key={`${b.pathId}-median`}
            d={scalePath(b.median, fit)}
            stroke={seriesHex(b.index)}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        <circle cx={fit.dx} cy={startY} r={8} fill={C.foreground} />
      </svg>
      {floor < height - 30 ? (
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: floor + 8,
            fontSize: 17,
            color: C.danger,
          }}
        >
          Out of money
        </div>
      ) : null}
    </div>
  );
}

function PathLine({
  path,
  horizonMonths,
}: {
  path: PublicShareDto['paths'][number];
  horizonMonths: number;
}) {
  const covers =
    path.type === 'stay'
      ? ''
      : path.medianBreakEvenMonth === null
        ? ` · not covering costs in ${horizonMonths} mo`
        : ` · covers costs from month ${path.medianBreakEvenMonth}`;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div
        style={{
          width: 16,
          height: 16,
          marginTop: 8,
          borderRadius: 8,
          backgroundColor: seriesHex(path.index),
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 24, fontWeight: 700 }}>{clip(path.name, 34)}</div>
        <div style={{ display: 'flex', fontSize: 20, color: C.muted }}>
          <span
            style={{ color: C.risk[riskLevel(path.probRunOut)], fontWeight: 700, marginRight: 6 }}
          >
            {formatPercent(path.probRunOut)}
          </span>
          <span>{`chance of running out${covers}`}</span>
        </div>
      </div>
    </div>
  );
}

/** Characters of a site address that fit the band's right side at the full 24 px. */
const BAND_HOST_CHARS = 46;

/**
 * Free plan: a band no one can miss, which is also an invitation. The plan label never wraps,
 * and the site address never breaks at its hyphens: a long address (a tunnel's, say) moves to a
 * second line on the right, and one longer still gets a smaller font.
 */
function Watermark({ host }: { host: string }) {
  const hostSize = Math.max(14, Math.min(24, Math.floor((24 * BAND_HOST_CHARS) / host.length)));
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        marginTop: 24,
        padding: '14px 24px',
        borderRadius: 18,
        backgroundImage: `linear-gradient(90deg, ${C.grad1}, ${C.grad2})`,
        color: C.onBrand,
        fontSize: 24,
        fontWeight: 700,
        lineHeight: 1.25,
      }}
    >
      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>Made with FUTURIA · free plan</span>
      <div
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
        }}
      >
        <span style={{ whiteSpace: 'nowrap' }}>Simulate yours at</span>
        <span style={{ whiteSpace: 'nowrap', marginLeft: 4, fontSize: hostSize }}>{host}</span>
      </div>
    </div>
  );
}

/** "My 3 futures": a shared simulation's card. No amounts, even when the page shows them. */
export function ShareCard({ share, host }: { share: PublicShareDto; host: string }) {
  const listed = share.paths.slice(0, MAX_LISTED_PATHS);
  const more = share.paths.length - listed.length;
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo />
        {share.watermark ? null : <div style={{ fontSize: 22, color: C.muted }}>{host}</div>}
      </div>
      <div style={{ display: 'flex', flex: 1, gap: 40, marginTop: 26 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 520 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>
            {`My ${share.paths.length} possible futures`}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: -1.6,
              lineHeight: 1.08,
            }}
          >
            {clip(share.title, 70)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 'auto' }}>
            {listed.map((path) => (
              <PathLine key={path.pathId} path={path} horizonMonths={share.horizonMonths} />
            ))}
            {more > 0 ? (
              <div style={{ fontSize: 20, color: C.muted }}>{`+${more} more`}</div>
            ) : null}
          </div>
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}
        >
          <Chart chart={share.chart} width={530} height={share.watermark ? 300 : 360} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 6,
              fontSize: 17,
              color: C.muted,
            }}
          >
            <span>Today</span>
            <span>{`Month ${share.horizonMonths}`}</span>
          </div>
        </div>
      </div>
      {share.watermark ? <Watermark host={host} /> : null}
    </Frame>
  );
}

/** The site's card (landing and every page without its own), or a share that isn't available. */
export function BrandCard({
  chart,
  title = 'Play out a career move before you make it.',
  subtitle = 'Thousands of simulated futures, your chance of running out of money, and what would help.',
  host,
}: {
  chart: FuturesChart | null;
  title?: string;
  subtitle?: string;
  host: string;
}) {
  return (
    <Frame>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo />
        <div style={{ fontSize: 22, color: C.muted }}>{host}</div>
      </div>
      <div style={{ display: 'flex', flex: 1, gap: 40, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: chart ? 520 : 1000 }}>
          <div style={{ fontSize: 60, fontWeight: 700, letterSpacing: -2.2, lineHeight: 1.04 }}>
            {clip(title, 80)}
          </div>
          <div style={{ marginTop: 22, fontSize: 26, color: C.muted, lineHeight: 1.35 }}>
            {subtitle}
          </div>
        </div>
        {chart ? <Chart chart={chart} width={530} height={380} /> : null}
      </div>
    </Frame>
  );
}
