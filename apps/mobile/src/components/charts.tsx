import * as React from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";

import { seriesColor, useTheme } from "@/theme";

/**
 * Charts as inline SVG.
 *
 * react-native-svg rather than a charting library: these are two small,
 * specific shapes, and the rules they have to obey — null ranks break the line,
 * the rank axis is inverted — are exactly the rules a general-purpose library
 * makes awkward to enforce.
 */

const WIDTH = 320;
const HEIGHT = 96;
const PAD = 6;

function scale(value: number, min: number, max: number): number {
  if (max === min) return HEIGHT / 2;
  return PAD + ((max - value) / (max - min)) * (HEIGHT - PAD * 2);
}

export function Sparkline({
  points,
  color,
  height = HEIGHT,
}: {
  points: number[];
  color?: string;
  height?: number;
}) {
  const t = useTheme();
  const stroke = color ?? seriesColor(0, t.scheme);

  if (points.length < 2) return <View style={{ height }} />;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const step = WIDTH / (points.length - 1);

  const d = points
    .map((value, i) => `${i === 0 ? "M" : "L"}${i * step},${scale(value, min, max)}`)
    .join(" ");

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      <Defs>
        {/* Fades toward the baseline so the fill reads as depth rather than as
            a solid block competing with the line. */}
        <LinearGradient id="areaFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.28} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <Path d={`${d} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`} fill="url(#areaFade)" />
      <Path
        d={d}
        stroke={stroke}
        strokeWidth={2}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}

export type RankPoint = { date: string; rank: number | null };

/**
 * Keyword rank over time.
 *
 * Two rules carried over from the web, both of which produce a confidently
 * wrong picture if broken:
 *
 *   the axis is inverted — rank 1 is the top, so lower values sit higher
 *   a null rank breaks the line — plotting it as zero draws the app as the
 *   best result in the world on the day it fell out of the results entirely
 */
export function RankChart({ points, scanDepth }: { points: RankPoint[]; scanDepth?: number | null }) {
  const t = useTheme();
  const ranked = points.filter((p): p is { date: string; rank: number } => p.rank !== null);

  if (ranked.length < 2) {
    return <View style={{ height: HEIGHT }} />;
  }

  const values = ranked.map((p) => p.rank);
  const best = Math.min(...values);
  const worst = Math.max(...values);
  const step = WIDTH / Math.max(1, points.length - 1);

  // Inverted: the best rank gets the smallest y. Note the arguments to `scale`
  // are swapped relative to the sparkline, which is the whole inversion.
  const y = (rank: number) => PAD + ((rank - best) / Math.max(1, worst - best)) * (HEIGHT - PAD * 2);

  // Built as separate segments so a gap stays a gap. One path with a `M` at
  // each break would work too; separate paths make the intent obvious.
  const segments: string[] = [];
  let current: string[] = [];

  points.forEach((point, i) => {
    if (point.rank === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${i * step},${y(point.rank)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  const stroke = seriesColor(0, t.scheme);

  return (
    <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      {segments.map((d, i) => (
        <Path key={i} d={d} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
      ))}

      {/* A dot on days with no rank, so a gap reads as "measured, not found"
          rather than as missing data. */}
      {points.map((point, i) =>
        point.rank === null ? (
          <Circle
            key={`gap-${i}`}
            cx={i * step}
            cy={HEIGHT - PAD}
            r={2}
            fill={t.color.textMuted}
          />
        ) : null,
      )}

      {scanDepth ? (
        <Line
          x1={0}
          y1={HEIGHT - PAD}
          x2={WIDTH}
          y2={HEIGHT - PAD}
          stroke={t.color.border}
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ) : null}
    </Svg>
  );
}
