/**
 * Top of Home: a greeting, today's date and the fleet in one line —
 * "12 on the road · 2 delayed" — each count opening that view of Trips.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { INK, MUTED, tap } from '../../notifications/components/parts';

const RED = '#D92D20';

function greeting(hour: number) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export function HomeHeader({ name, tz, now, running, delayed, loading, onRunning, onDelayed }: {
  name: string | null;
  tz: string;
  now: number;
  running: number;
  delayed: number;
  loading: boolean;
  onRunning: () => void;
  onDelayed: () => void;
}) {
  const fmt = (opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(new Date(now));
    } catch {
      return new Intl.DateTimeFormat('en-GB', opts).format(new Date(now));
    }
  };
  const hour = Number(fmt({ hour: '2-digit', hour12: false })) || 0;
  const first = name?.trim().split(/\s+/)[0];

  return (
    <View style={s.wrap}>
      <Text style={s.hello}>{greeting(hour)}{first ? `, ${first[0].toUpperCase()}${first.slice(1)}` : ''}</Text>
      <Text style={s.line}>
        {fmt({ weekday: 'short', day: 'numeric', month: 'short' })}
        {loading ? null : (
          <>
            <Text style={s.sep}>{'  ·  '}</Text>
            <Text style={s.link} onPress={() => { tap(); onRunning(); }} suppressHighlighting>
              {running ? `${running} on the road` : 'No trucks on the road'}
            </Text>
            {delayed ? (
              <>
                <Text style={s.sep}>{'  ·  '}</Text>
                <Text style={[s.link, { color: RED }]} onPress={() => { tap(); onDelayed(); }} suppressHighlighting>
                  {delayed} delayed
                </Text>
              </>
            ) : null}
          </>
        )}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 4, paddingHorizontal: 2 },
  hello: { fontSize: 24, fontWeight: '700', color: INK, letterSpacing: -0.4 },
  line: { fontSize: 14, color: MUTED },
  sep: { color: '#C4C4CC' },
  link: { fontWeight: '600', color: INK },
});
