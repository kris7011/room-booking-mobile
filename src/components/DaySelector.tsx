import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

import { spacing } from '../theme/theme';
import { addDays, isSameDay, shortDateLabel, startOfDay, weekdayLabel } from '../utils/date-time';
import { clampScrollOffset, scrollDeltaToReveal } from '../utils/scroll-into-view';
import { Chip } from './Chip';

const DAYS_AHEAD = 14;

interface DaySelectorProps {
  value: Date;
  onChange: (day: Date) => void;
  today: Date;
}

interface Extent {
  start: number;
  size: number;
}

// Horizontal strip of the next two weeks. A custom picker instead of a native
// date picker library keeps it dependency-free and identical on web and mobile.
// The selected day is always scrolled fully into view, also when it is chosen
// while half hidden at the edge.
export function DaySelector({ value, onChange, today }: DaySelectorProps) {
  const first = startOfDay(today);
  const days = Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(first, index));
  const selectedKey = startOfDay(value).getTime();

  const scrollRef = useRef<ScrollViewInstance>(null);
  const chipExtents = useRef(new Map<number, Extent>());
  const viewport = useRef<Extent>({ start: 0, size: 0 });
  const contentWidth = useRef(0);

  // Layout callbacks may run the handler of an earlier render: React Native
  // Web picks up onLayout when a resize is observed and calls it after
  // measuring in a later task, so a tap in between leaves the old handler
  // (issue #34). Reading the selection from a ref makes every callback reveal
  // the day that is selected now.
  const selectedKeyRef = useRef(selectedKey);
  useLayoutEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const revealSelected = useCallback((animated: boolean) => {
    const chip = chipExtents.current.get(selectedKeyRef.current);
    const { start, size } = viewport.current;
    if (!chip || size === 0) return;

    const delta = scrollDeltaToReveal({
      itemStart: chip.start,
      itemEnd: chip.start + chip.size,
      visibleStart: start,
      visibleEnd: start + size,
      margin: spacing.md,
    });
    if (delta === 0) return;
    const x = clampScrollOffset(start + delta, contentWidth.current, size);
    viewport.current = { start: x, size };
    scrollRef.current?.scrollTo({ x, animated });
  }, []);

  // A new selection: scroll it into view.
  useEffect(() => revealSelected(true), [selectedKey, revealSelected]);

  const handleChipLayout = (key: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    chipExtents.current.set(key, { start: x, size: width });
    // First layout of the selected chip, e.g. a default day further ahead.
    if (key === selectedKeyRef.current) revealSelected(false);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    viewport.current = { ...viewport.current, size: event.nativeEvent.layout.width };
    revealSelected(false);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current = { ...viewport.current, start: event.nativeEvent.contentOffset.x };
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      onLayout={handleLayout}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={(width) => {
        contentWidth.current = width;
      }}
    >
      {days.map((day) => (
        <View key={day.getTime()} onLayout={handleChipLayout(day.getTime())}>
          <Chip
            label={weekdayLabel(day, today)}
            caption={shortDateLabel(day)}
            selected={isSameDay(day, value)}
            onPress={() => onChange(day)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
});
