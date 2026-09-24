import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Check, Truck, Package, MapPin } from 'lucide-react-native';
import { useLanguage } from '@mercon/mobile-shared/lib/language-context';
import { MobileTrip } from '@mercon/mobile-shared/lib/trips';
import { parseTripRouteNodes, findTimelineIndex, TimelineStop, TimelineTarget } from '../lib/routeParser';
import { STOP_ROLE_COLORS, timelineStopRole } from '@mercon/shared-types';

export interface TripProgressStepperProps {
  trip: MobileTrip | null;
  /** The route node the driver is at / heading to. */
  target: TimelineTarget;
}

// Above this many nodes the row scrolls horizontally instead of squeezing.
const MAX_FIXED_NODES = 4;
const SCROLL_NODE_WIDTH = 84;

const iconFor = (node: TimelineStop) =>
  node.iconType === 'House' ? Truck : node.iconType === 'Route' ? Package : MapPin;

/** Route progress bar: one node per location on the trip, in route order. */
export const TripProgressStepper: React.FC<TripProgressStepperProps> = ({ trip, target }) => {
  const { t } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);

  const nodes = useMemo(() => parseTripRouteNodes(trip), [trip]);
  const activeIndex = findTimelineIndex(nodes, target);
  const allDone = nodes.length > 0 && activeIndex >= nodes.length;
  const scrollable = nodes.length > MAX_FIXED_NODES;

  if (nodes.length === 0) return null;

  const row = nodes.map((node, index) => {
    const IconComp = iconFor(node);
    const isCompleted = allDone || index < activeIndex;
    const isActive = !allDone && index === activeIndex;
    const isUpcoming = !allDone && index > activeIndex;
    const isLast = index === nodes.length - 1;
    const isReturn = (node.legIndex ?? 0) === 1;
    // Origin/loading = blue, destination/delivery = green, stops in between = red
    // (same palette as the web create-trip form and trip details).
    const role = STOP_ROLE_COLORS[timelineStopRole(node)];
    const nodeColorStyle = isActive
      ? { backgroundColor: role.main, borderColor: role.main }
      : isCompleted
      ? { backgroundColor: allDone ? role.main : role.soft, borderColor: role.main }
      : { backgroundColor: '#FFFFFF', borderColor: role.soft };
    const iconColor = isActive || allDone ? '#FFFFFF' : role.main;
    const labelColor = isUpcoming ? '#94A3B8' : role.text;

    return (
      <React.Fragment key={`${node.id}-${index}`}>
        <View style={[styles.stepItem, scrollable && { width: SCROLL_NODE_WIDTH, flex: 0 }]}>
          <View
            style={[
              styles.nodeCircle,
              allDone && styles.nodeAllDone,
              isCompleted && !allDone && styles.nodeCompleted,
              isActive && styles.nodeActive,
              isUpcoming && styles.nodeUpcoming,
              nodeColorStyle,
              isActive && { shadowColor: role.main },
            ]}
          >
            {allDone ? (
              <Check size={14} color="#FFFFFF" strokeWidth={3} />
            ) : isCompleted ? (
              <Check size={13} color={iconColor} strokeWidth={2.8} />
            ) : isActive ? (
              <IconComp size={14} color="#FFFFFF" strokeWidth={2.4} />
            ) : (
              <IconComp size={14} color={iconColor} strokeWidth={2} />
            )}
          </View>

          <Text
            style={[
              styles.label,
              allDone && styles.labelAllDone,
              isCompleted && !allDone && styles.labelCompleted,
              isActive && styles.labelActive,
              isUpcoming && styles.labelUpcoming,
              { color: labelColor },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {isReturn ? `↩ ${node.name}` : node.name}
          </Text>
          {allDone && isLast && (
            <Text style={styles.subtextCompleted}>{t('status_completed', 'Completed')}</Text>
          )}
        </View>

        {!isLast && (
          <View
            style={[
              styles.connectorLine,
              scrollable && styles.connectorScrollable,
              isCompleted ? styles.connectorCompleted : styles.connectorInactive,
            ]}
          />
        )}
      </React.Fragment>
    );
  });

  return (
    <View style={styles.container}>
      {scrollable ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stepperRow}
          onContentSizeChange={() => {
            // Keep the active node in view (centered where possible).
            const x = Math.max(0, activeIndex * SCROLL_NODE_WIDTH - SCROLL_NODE_WIDTH);
            scrollRef.current?.scrollTo({ x, animated: false });
          }}
        >
          {row}
        </ScrollView>
      ) : (
        <View style={styles.stepperRow}>{row}</View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: '100%',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    zIndex: 2,
    flex: 1,
    paddingHorizontal: 2,
  },
  nodeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  nodeAllDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  nodeCompleted: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  nodeActive: {
    backgroundColor: '#FA634E',
    borderColor: '#FA634E',
    shadowColor: '#FA634E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  nodeUpcoming: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  connectorLine: {
    height: 2.5,
    flex: 1,
    marginTop: 15,
    marginHorizontal: -8,
    zIndex: 1,
  },
  // Zero net width: spans circle edge to circle edge across fixed-width items.
  connectorScrollable: {
    flex: 0,
    width: SCROLL_NODE_WIDTH - 32,
    marginHorizontal: -(SCROLL_NODE_WIDTH - 32) / 2,
  },
  connectorCompleted: {
    backgroundColor: '#10B981',
  },
  connectorInactive: {
    backgroundColor: '#E2E8F0',
  },
  label: {
    fontSize: 9.8,
    marginTop: 5,
    textAlign: 'center',
    fontWeight: '700',
    maxWidth: '100%',
  },
  labelAllDone: {
    color: '#10B981',
    fontWeight: '800',
  },
  labelCompleted: {
    color: '#10B981',
    fontWeight: '700',
  },
  labelActive: {
    color: '#FA634E',
    fontWeight: '800',
  },
  labelUpcoming: {
    color: '#94A3B8',
    fontWeight: '600',
  },
  subtextCompleted: {
    fontSize: 9,
    color: '#10B981',
    fontWeight: '700',
    marginTop: 1,
  },
});

export default TripProgressStepper;
