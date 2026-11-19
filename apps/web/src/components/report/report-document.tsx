import { join } from 'node:path';
import {
  Circle,
  Document,
  Font,
  Line,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import {
  type FuturesChart,
  type PathResult,
  type SimulationDto,
  milestoneMonths,
} from '@futuria/shared';
import { formatMoney, futuresChart } from '@futuria/engine';
import { FAN } from '@/components/brand';
import { formatMonth, formatPercent } from '@/lib/format';
import { describeValue, groupFields } from '@/lib/model-fields';
import { fitBox, scalePath } from '@/lib/og';
import { reportSummary } from '@/lib/report';
import { RISK_LABEL, riskLevel } from '@/lib/risk';
import { seriesHex } from '@/lib/series-colors';
import { EVENT_LABELS, buildActions, buildTimeline } from '@/lib/time-machine';

/*
 * The PDF report (Pro): every path, the futures chart, what matters most, the Time Machine
 * (realistic), the action plan and every assumption. Rendered on the server by
 * @react-pdf/renderer, which runs outside Next's React: no hooks, no context, plain components.
 * It is the owner's own report, so it shows amounts.
 */

const FONT = 'Plus Jakarta Sans';
// Literal paths: output file tracing ships the fonts with the route.
Font.register({
  family: FONT,
  fonts: [
    { src: join(process.cwd(), 'assets/fonts/PlusJakartaSans-Regular.ttf'), fontWeight: 400 },
    { src: join(process.cwd(), 'assets/fonts/PlusJakartaSans-Bold.ttf'), fontWeight: 700 },
  ],
});
// Never split words across lines (react-pdf hyphenates by default).
Font.registerHyphenationCallback((word) => [word]);

/** The light theme of globals.css, for paper. */
const C = {
  foreground: '#06201a',
  muted: '#4b625b',
  border: '#d9e6df',
  surfaceMuted: '#e9f2ed',
  accent: '#037a47',
  onBrand: '#03140d',
  grad: '#0bcf77',
  danger: '#b91c1c',
  risk: { low: '#047857', some: '#92400e', high: '#b91c1c' },
  estimate: '#92400e',
  estimateSurface: '#fef3c7',
} as const;

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: FONT,
    fontSize: 9.5,
    lineHeight: 1.4,
    color: C.foreground,
  },
  row: { flexDirection: 'row' },
  muted: { color: C.muted },
  bold: { fontWeight: 700 },
  h1: { fontSize: 22, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.4 },
  h2: { fontSize: 15, fontWeight: 700, marginBottom: 8, letterSpacing: -0.2 },
  h3: { fontSize: 11.5, fontWeight: 700, marginBottom: 4 },
  section: { marginTop: 22 },
  card: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  small: { fontSize: 8.5 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: C.muted,
  },
});

const TABLE_COLUMNS = [2.4, 1.3, 1.5, 1.9, 1.3];

function Swatch({ index, size = 7 }: { index: number; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: seriesHex(index, 'light'),
        marginRight: 5,
        marginTop: 2.5,
      }}
    />
  );
}

function LogoMark() {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        backgroundColor: C.grad,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={16} height={16} viewBox="0 0 24 24">
        {FAN.map((d) => (
          <Path
            key={d}
            d={d}
            stroke={C.onBrand}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        <Circle cx={4} cy={12} r={2.2} fill={C.onBrand} />
      </Svg>
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={[s.row, { marginTop: 1 }]}>
          <Text style={{ width: 9 }}>•</Text>
          <Text style={{ flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({
  title,
  children,
  breakBefore,
}: {
  title: string;
  children: ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <View style={s.section} break={breakBefore}>
      <Text style={s.h2} minPresenceAhead={60}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Every simulated future as a thin line, each path's median bold, the floor shaded. */
function ChartFigure({
  chart,
  currency,
  width,
  height,
}: {
  chart: FuturesChart;
  currency: string;
  width: number;
  height: number;
}) {
  const fit = fitBox(chart, { width, height }, 4);
  const floor = chart.floorY * chart.height * fit.sy + fit.dy;
  const startY = chart.startY * chart.height * fit.sy + fit.dy;
  return (
    <View>
      <Svg width={width} height={height}>
        {floor < height ? (
          <Rect x={0} y={floor} width={width} height={height - floor} fill="#fee2e2" />
        ) : null}
        <Line x1={0} x2={width} y1={floor} y2={floor} stroke={C.danger} strokeWidth={0.6} />
        {chart.bundles.map((b) => (
          <Path
            key={b.pathId}
            d={scalePath(b.runs, fit)}
            stroke={seriesHex(b.index, 'light')}
            strokeOpacity={0.22}
            strokeWidth={0.5}
            fill="none"
          />
        ))}
        {chart.bundles.map((b) => (
          <Path
            key={`${b.pathId}-median`}
            d={scalePath(b.median, fit)}
            stroke={seriesHex(b.index, 'light')}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        <Circle cx={fit.dx} cy={startY} r={3} fill={C.foreground} />
      </Svg>
      <View style={[s.row, s.small, s.muted, { justifyContent: 'space-between', marginTop: 3 }]}>
        <Text>Today: {chart.startCash === null ? '' : formatMoney(chart.startCash, currency)}</Text>
        <Text>Month {Math.round(chart.horizonMonths / 2)}</Text>
        <Text>Month {chart.horizonMonths}</Text>
      </View>
      <View style={[s.row, { flexWrap: 'wrap', marginTop: 6 }]}>
        {chart.bundles.map((b) => (
          <View key={b.pathId} style={[s.row, { marginRight: 14, marginBottom: 2 }]}>
            <Swatch index={b.index} />
            <Text>
              <Text style={s.bold}>{b.name}</Text>
              <Text style={s.muted}>
                {b.end === null ? '' : `  ${formatMoney(b.end, currency)} typical at the end`}
              </Text>
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.small, s.muted, { marginTop: 4 }]}>
        Each thin line is one simulated future; the bold line is the typical (median) one. Below the
        red line, savings fall under your emergency floor.
      </Text>
    </View>
  );
}

function SummaryTable({
  simulation,
  currency,
  horizon,
}: {
  simulation: SimulationDto;
  currency: string;
  horizon: number;
}) {
  const header = [
    'Path',
    'Chance of running out',
    `Typical savings, month ${horizon}`,
    'Likely range (P10–P90)',
    'Covers its costs from',
  ];
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8 }}>
      <View
        style={[
          s.row,
          { backgroundColor: C.surfaceMuted, paddingVertical: 6, paddingHorizontal: 8 },
        ]}
      >
        {header.map((h, i) => (
          <Text key={h} style={[s.small, s.bold, { flex: TABLE_COLUMNS[i] }]}>
            {h}
          </Text>
        ))}
      </View>
      {reportSummary(simulation).map((row) => {
        const level = riskLevel(row.probRunOut);
        return (
          <View
            key={row.pathId}
            style={[
              s.row,
              {
                paddingVertical: 6,
                paddingHorizontal: 8,
                borderTopWidth: 1,
                borderTopColor: C.border,
              },
            ]}
            wrap={false}
          >
            <View style={[s.row, { flex: TABLE_COLUMNS[0], paddingRight: 6 }]}>
              <Swatch index={row.index} />
              <Text style={[s.bold, { flex: 1 }]}>{row.name}</Text>
            </View>
            <Text style={{ flex: TABLE_COLUMNS[1], color: C.risk[level] }}>
              <Text style={s.bold}>{formatPercent(row.probRunOut)}</Text> ·{' '}
              {RISK_LABEL[level].toLowerCase()}
            </Text>
            <Text style={[s.bold, { flex: TABLE_COLUMNS[2] }]}>
              {formatMoney(row.cashP50, currency)}
            </Text>
            <Text style={{ flex: TABLE_COLUMNS[3] }}>
              {formatMoney(row.cashP10, currency)} to {formatMoney(row.cashP90, currency)}
            </Text>
            <Text style={{ flex: TABLE_COLUMNS[4] }}>
              {formatMonth(row.medianBreakEvenMonth, `Not within ${horizon} months`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Drivers({
  simulation,
  currency,
  horizon,
}: {
  simulation: SimulationDto;
  currency: string;
  horizon: number;
}) {
  const analysis = simulation.analysis!;
  return (
    <View>
      {analysis.result.paths.map((path) => {
        const items = (analysis.byPath[path.pathId]?.sensitivity ?? [])
          .filter((d) => d.share >= 0.03)
          .slice(0, 5);
        if (!items.length) return null;
        return (
          <View key={path.pathId} style={s.card} wrap={false}>
            <Text style={s.h3}>{path.name}</Text>
            {items.map((d) => (
              <View key={d.field} style={[s.row, { alignItems: 'center', marginTop: 4 }]}>
                <Text style={{ width: 150 }}>{d.label}</Text>
                <View
                  style={{
                    width: 120,
                    height: 6,
                    backgroundColor: C.surfaceMuted,
                    borderRadius: 3,
                    marginRight: 8,
                  }}
                >
                  <View
                    style={{
                      width: 120 * Math.min(1, d.share),
                      height: 6,
                      backgroundColor: C.accent,
                      borderRadius: 3,
                    }}
                  />
                </View>
                <Text style={[s.bold, { width: 36 }]}>{formatPercent(d.share)}</Text>
                <Text style={[s.small, s.muted, { flex: 1 }]}>
                  Month {horizon} savings{' '}
                  {formatMoney(
                    Math.min(d.low.medianCashAtHorizon, d.high.medianCashAtHorizon),
                    currency,
                  )}{' '}
                  to{' '}
                  {formatMoney(
                    Math.max(d.low.medianCashAtHorizon, d.high.medianCashAtHorizon),
                    currency,
                  )}
                </Text>
              </View>
            ))}
          </View>
        );
      })}
      <Text style={[s.small, s.muted]}>
        Share of the total swing in typical savings when each assumption moves across its range, all
        else equal.
      </Text>
    </View>
  );
}

function TimeMachine({
  path,
  simulation,
  currency,
  horizon,
}: {
  path: PathResult;
  simulation: SimulationDto;
  currency: string;
  horizon: number;
}) {
  const steps = buildTimeline(path, 'realistic', simulation.narrative?.[path.pathId], horizon);
  return (
    <View>
      <Text style={[s.h3, { marginTop: 6 }]}>{path.name}</Text>
      {steps.map((step) => (
        <View key={step.month} style={[s.row, { marginBottom: 7 }]} wrap={false}>
          <View style={{ width: 118, paddingRight: 8 }}>
            <Text style={s.bold}>Month {step.month}</Text>
            <Text style={[s.small, s.muted]}>Savings {formatMoney(step.cash, currency)}</Text>
            <Text style={[s.small, s.muted]}>Income {formatMoney(step.income, currency)}/mo</Text>
            <Text style={[s.small, s.muted]}>
              Spending {formatMoney(step.expenses, currency)}/mo
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            {step.milestone ? <Text style={s.bold}>{step.milestone.headline}</Text> : null}
            {step.events.length ? (
              <Text style={[s.small, { color: C.accent, marginTop: 1 }]}>
                {step.events.map((e) => `${EVENT_LABELS[e.type]} (month ${e.month})`).join(' · ')}
              </Text>
            ) : null}
            {step.milestone ? (
              <View style={{ marginTop: 2 }}>
                <Bullets
                  items={[
                    ...step.milestone.events,
                    ...step.milestone.challenges.map((c) => `Challenge: ${c}`),
                    ...step.milestone.risks.map((r) => `Risk: ${r}`),
                  ]}
                />
              </View>
            ) : (
              <Text style={[s.small, s.muted]}>No story for this month.</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function Actions({ path, simulation }: { path: PathResult; simulation: SimulationDto }) {
  const { story, other } = buildActions(
    simulation.narrative?.[path.pathId],
    simulation.analysis!.byPath[path.pathId]?.interventions ?? [],
  );
  const cards = [...story, ...other];
  if (!cards.length) return null;
  return (
    <View>
      <Text style={[s.h3, { marginTop: 6 }]}>{path.name}</Text>
      {cards.map((card) => (
        <View key={card.key} style={s.card} wrap={false}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.bold, { flex: 1, paddingRight: 8 }]}>{card.title}</Text>
            {card.impact ? (
              <Text style={s.small}>
                Chance of running out{' '}
                <Text style={s.bold}>
                  {formatPercent(card.impact.before.probRunOut)} to{' '}
                  {formatPercent(card.impact.after.probRunOut)}
                </Text>
              </Text>
            ) : null}
          </View>
          {card.why ? <Text style={[s.muted, { marginTop: 2 }]}>{card.why}</Text> : null}
          {card.steps.length ? (
            <View style={{ marginTop: 3 }}>
              <Bullets items={card.steps} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Assumptions({ simulation, currency }: { simulation: SimulationDto; currency: string }) {
  const groups = groupFields(simulation.model!);
  return (
    <View>
      {groups.map((group) => (
        <View key={group.pathId ?? 'baseline'} style={{ marginBottom: 10 }}>
          <Text style={s.h3} minPresenceAhead={40}>
            {group.title}
          </Text>
          {group.fields
            .filter((f) => f.field !== 'baseline.currency')
            .map((f) => {
              const estimate = f.assumption?.source === 'ai_estimate';
              return (
                <View
                  key={f.key}
                  style={[
                    s.row,
                    { paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.border },
                  ]}
                  wrap={false}
                >
                  <Text style={{ width: 170, paddingRight: 8 }}>{f.label}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.bold}>{describeValue(f.value, f.meta, currency)}</Text>
                    {f.assumption?.rationale ? (
                      <Text style={[s.small, s.muted]}>{f.assumption.rationale}</Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      s.small,
                      {
                        width: 62,
                        textAlign: 'right',
                        color: estimate ? C.estimate : C.muted,
                      },
                    ]}
                  >
                    {estimate ? 'AI estimate' : f.assumption?.source === 'user' ? 'Yours' : ''}
                  </Text>
                </View>
              );
            })}
        </View>
      ))}
    </View>
  );
}

/** The whole report for one simulation with results (the route checks that). */
export function ReportDocument({
  simulation,
  generatedAt,
}: {
  simulation: SimulationDto;
  generatedAt: Date;
}) {
  const analysis = simulation.analysis!;
  const model = simulation.model!;
  const { result } = analysis;
  const currency = result.currency;
  const horizon = result.horizonMonths;
  const chart = futuresChart(model, result, { seed: result.seed, runsPerPath: 40 });
  const date = generatedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const hasStories = result.paths.some((p) => simulation.narrative?.[p.pathId]);

  return (
    <Document
      title={`${simulation.title}: FUTURIA report`}
      author="FUTURIA"
      subject="Simulated futures of a career decision"
      creator="FUTURIA"
      producer="FUTURIA"
    >
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]} fixed>
          <View style={[s.row, { alignItems: 'center' }]}>
            <LogoMark />
            <Text style={[s.bold, { fontSize: 12, marginLeft: 7 }]}>Futuria</Text>
          </View>
          <Text style={[s.small, s.muted]}>Simulation report · {date}</Text>
        </View>

        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>{simulation.title}</Text>
          <Text style={[s.muted, { marginTop: 6, fontSize: 10.5 }]}>
            &ldquo;{simulation.decisionText}&rdquo;
          </Text>
          <Text style={[s.small, s.muted, { marginTop: 6 }]}>
            {result.runs.toLocaleString('en-US')} simulated futures per path · {horizon} months ·{' '}
            {result.paths.length} paths · Time Machine months {milestoneMonths(horizon).join(', ')}
          </Text>
        </View>

        <Section title="Your futures at a glance">
          <SummaryTable simulation={simulation} currency={currency} horizon={horizon} />
        </Section>

        <Section title="How your savings could move">
          <ChartFigure chart={chart} currency={currency} width={507} height={190} />
        </Section>

        <Section title="What matters most">
          <Drivers simulation={simulation} currency={currency} horizon={horizon} />
        </Section>

        <Section title="Time Machine: a typical future, month by month" breakBefore>
          {hasStories ? null : (
            <Text style={[s.muted, { marginBottom: 6 }]}>
              The stories weren&apos;t written for this run; the engine&apos;s numbers are complete.
            </Text>
          )}
          {result.paths.map((path) => (
            <TimeMachine
              key={path.pathId}
              path={path}
              simulation={simulation}
              currency={currency}
              horizon={horizon}
            />
          ))}
        </Section>

        <Section title="Action plan" breakBefore>
          {result.paths.map((path) => (
            <Actions key={path.pathId} path={path} simulation={simulation} />
          ))}
        </Section>

        <Section title="Every assumption" breakBefore>
          <Text style={[s.muted, { marginBottom: 8 }]}>
            Ranges are low to high, with the most likely value. AI estimates are marked; you can
            change any of them in FUTURIA.
          </Text>
          <Assumptions simulation={simulation} currency={currency} />
        </Section>

        <View style={s.footer} fixed>
          <Text>Simulated ranges, not predictions. Not financial, legal or career advice.</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
