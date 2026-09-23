import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  User,
  Truck,
  UserPlus,
  Trash2,
  X,
  Search,
  Settings2,
} from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../theme/tokens';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { AppModal } from './common/AppModal';
import { OperatorDriver, OperatorVehicle } from '../lib/operator';
import { DriverAvatar } from '../features/drivers/components/DriverAvatar';

export interface DayAssignmentOverride {
  driver_id?: string;
  vehicle_id?: string;
  co_driver_id?: string;
  co_driver_payout?: number;
  isCustom?: boolean;
}

interface MonthlyCalendarSelectorProps {
  selectedDates: string[];
  onToggleDate: (dateStr: string) => void;
  onSelectAllWeekdays: () => void;
  onSelectAllDays: () => void;
  onClearAll: () => void;
  currentMonth: Date;
  onMonthChange: (newMonth: Date) => void;
  assignmentMode: 'MASTER' | 'PER_DAY' | 'ROTATION';
  onToggleAssignmentMode: (mode: 'MASTER' | 'PER_DAY' | 'ROTATION') => void;
  rotationCount?: 2 | 3 | 4;
  onRotationCountChange?: (count: 2 | 3 | 4) => void;
  rotationDrivers?: string[];
  rotationVehicles?: string[];
  onUpdateRotationDriver?: (slotIdx: number, driverId: string) => void;
  onUpdateRotationVehicle?: (slotIdx: number, vehicleId: string) => void;
  onDuplicateFirstDayToAll?: () => void;
  dayAssignments: Record<string, DayAssignmentOverride>;
  onSaveDayOverride: (dateStr: string, override: DayAssignmentOverride | null) => void;
  drivers: OperatorDriver[];
  vehicles: OperatorVehicle[];
  masterDriverId?: string;
  masterVehicleId?: string;
  masterCoDriverId?: string;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MonthlyCalendarSelector: React.FC<MonthlyCalendarSelectorProps> = ({
  selectedDates,
  onToggleDate,
  onSelectAllWeekdays,
  onSelectAllDays,
  onClearAll,
  currentMonth,
  onMonthChange,
  assignmentMode,
  onToggleAssignmentMode,
  rotationCount = 2,
  onRotationCountChange,
  rotationDrivers = [],
  rotationVehicles = [],
  onUpdateRotationDriver,
  onUpdateRotationVehicle,
  onDuplicateFirstDayToAll,
  dayAssignments,
  onSaveDayOverride,
  drivers,
  vehicles,
  masterDriverId,
  masterVehicleId,
  masterCoDriverId,
}) => {
  const [overrideModalDate, setOverrideModalDate] = useState<string | null>(null);

  // Temporary modal state for day override
  const [overrideDriverId, setOverrideDriverId] = useState<string>('');
  const [overrideVehicleId, setOverrideVehicleId] = useState<string>('');
  const [overrideCoDriverId, setOverrideCoDriverId] = useState<string>('');
  const [overrideCoDriverPayout, setOverrideCoDriverPayout] = useState<string>('');

  // Search states for override modal
  const [driverSearch, setDriverSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [coDriverSearch, setCoDriverSearch] = useState('');

  // Month navigation helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-indexed

  const monthLabel = currentMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    const prev = new Date(year, month - 1, 1);
    onMonthChange(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(year, month + 1, 1);
    onMonthChange(next);
  };

  // Generate calendar grid cells for currentMonth
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 6 = Sat
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ type: 'empty' | 'day'; dayNum?: number; dateStr?: string }> = [];

    // Empty leading padding cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ type: 'empty' });
    }

    // Days of month
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      cells.push({ type: 'day', dayNum: d, dateStr });
    }

    return cells;
  }, [year, month]);

  const handleOpenOverrideModal = (dateStr: string) => {
    const existing = dayAssignments[dateStr];
    setOverrideDriverId(existing?.driver_id ?? masterDriverId ?? '');
    setOverrideVehicleId(existing?.vehicle_id ?? masterVehicleId ?? '');
    setOverrideCoDriverId(existing?.co_driver_id ?? masterCoDriverId ?? '');
    setOverrideCoDriverPayout(existing?.co_driver_payout ? String(existing.co_driver_payout) : '');
    setDriverSearch('');
    setVehicleSearch('');
    setCoDriverSearch('');
    setOverrideModalDate(dateStr);
  };

  const handleSaveModalOverride = () => {
    if (!overrideModalDate) return;
    const payoutNum = overrideCoDriverPayout ? parseFloat(overrideCoDriverPayout) : undefined;
    onSaveDayOverride(overrideModalDate, {
      driver_id: overrideDriverId || undefined,
      vehicle_id: overrideVehicleId || undefined,
      co_driver_id: overrideCoDriverId || undefined,
      co_driver_payout: payoutNum,
    });
    setOverrideModalDate(null);
  };

  const handleClearModalOverride = () => {
    if (!overrideModalDate) return;
    onSaveDayOverride(overrideModalDate, null);
    setOverrideModalDate(null);
  };

  // Filter lists for override modal
  const filteredDrivers = useMemo(() => {
    if (!driverSearch.trim()) return drivers;
    const q = driverSearch.toLowerCase().trim();
    return drivers.filter((d) => {
      const name = `${d.first_name} ${d.last_name}`.toLowerCase();
      const phone = (d.phone_primary || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [drivers, driverSearch]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;
    const q = vehicleSearch.toLowerCase().trim();
    return vehicles.filter((v) => {
      const plate = (v.plate_number || '').toLowerCase();
      const type = (v.asset_type || '').toLowerCase();
      return plate.includes(q) || type.includes(q);
    });
  }, [vehicles, vehicleSearch]);

  const filteredCoDrivers = useMemo(() => {
    const available = drivers.filter((d) => d.id !== overrideDriverId);
    if (!coDriverSearch.trim()) return available;
    const q = coDriverSearch.toLowerCase().trim();
    return available.filter((d) => {
      const name = `${d.first_name} ${d.last_name}`.toLowerCase();
      const phone = (d.phone_primary || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [drivers, overrideDriverId, coDriverSearch]);

  return (
    <View style={styles.container}>
      {/* Month Navigation Header */}
      <View style={styles.monthHeader}>
        <TouchableOpacity style={styles.monthNavBtn} onPress={handlePrevMonth}>
          <ChevronLeft size={20} color={Colors.gray700} />
        </TouchableOpacity>
        <View style={styles.monthTitleRow}>
          <CalendarIcon size={18} color={Colors.primary} />
          <Text style={styles.monthTitleText}>{monthLabel}</Text>
        </View>
        <TouchableOpacity style={styles.monthNavBtn} onPress={handleNextMonth}>
          <ChevronRight size={20} color={Colors.gray700} />
        </TouchableOpacity>
      </View>

      {/* Quick Shortcuts Bar */}
      <View style={styles.shortcutsRow}>
        <TouchableOpacity style={styles.shortcutBtn} onPress={onSelectAllWeekdays}>
          <Text style={styles.shortcutBtnText}>Sun–Thu (Weekdays)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shortcutBtn} onPress={onSelectAllDays}>
          <Text style={styles.shortcutBtnText}>All Days ({new Date(year, month + 1, 0).getDate()})</Text>
        </TouchableOpacity>
        {selectedDates.length > 0 && (
          <TouchableOpacity style={[styles.shortcutBtn, styles.clearShortcutBtn]} onPress={onClearAll}>
            <Text style={styles.clearShortcutText}>Clear ({selectedDates.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Weekday Column Headers */}
      <View style={styles.weekdayHeaderRow}>
        {WEEKDAY_NAMES.map((wd, i) => (
          <Text key={wd} style={[styles.weekdayHeaderText, (i === 5 || i === 6) && styles.weekendHeaderText]}>
            {wd}
          </Text>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarCells.map((cell, idx) => {
          if (cell.type === 'empty') {
            return <View key={`empty-${idx}`} style={styles.emptyCell} />;
          }

          const dateStr = cell.dateStr!;
          const isSelected = selectedDates.includes(dateStr);
          const hasOverride = Boolean(dayAssignments[dateStr]);

          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                hasOverride && styles.dayCellOverride,
              ]}
              activeOpacity={0.7}
              onPress={() => onToggleDate(dateStr)}
            >
              <Text style={[styles.dayNumText, isSelected && styles.dayNumTextSelected]}>
                {cell.dayNum}
              </Text>

              {/* Status & Override Indicators */}
              {isSelected && (
                <View style={styles.indicatorContainer}>
                  {assignmentMode === 'PER_DAY' ? (
                    <TouchableOpacity
                      style={[styles.overrideBadge, hasOverride && styles.overrideBadgeActive]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleOpenOverrideModal(dateStr);
                      }}
                    >
                      <Settings2 size={10} color={hasOverride ? Colors.white : Colors.primary} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.checkDot}>
                      <Check size={10} color={Colors.white} strokeWidth={3} />
                    </View>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selection Summary */}
      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {selectedDates.length === 0
            ? 'No dates selected yet for this month.'
            : `${selectedDates.length} calendar day${selectedDates.length > 1 ? 's' : ''} selected`}
        </Text>

        {/* Assignment Mode Segment Switcher */}
        <View style={styles.modeSegmentContainer}>
          <TouchableOpacity
            style={[styles.modeSegmentBtn, assignmentMode === 'MASTER' && styles.modeSegmentBtnActive]}
            onPress={() => onToggleAssignmentMode('MASTER')}
          >
            <Text style={[styles.modeSegmentText, assignmentMode === 'MASTER' && styles.modeSegmentTextActive]}>
              Master Assignment
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeSegmentBtn, assignmentMode === 'PER_DAY' && styles.modeSegmentBtnActive]}
            onPress={() => onToggleAssignmentMode('PER_DAY')}
          >
            <Text style={[styles.modeSegmentText, assignmentMode === 'PER_DAY' && styles.modeSegmentTextActive]}>
              Per-Day Overrides
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Per-Day Override Modal */}
      <AppModal
        visible={Boolean(overrideModalDate)}
        onClose={() => setOverrideModalDate(null)}
        type="dialog"
        title={`Override Assignment — ${overrideModalDate ?? ''}`}
      >
        <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {/* Primary Driver Override */}
          <Text style={styles.fieldLabel}>Primary Driver</Text>
          <View style={styles.searchBar}>
            <Search size={14} color={Colors.gray500} />
            <TextInput
              style={styles.searchInput}
              value={driverSearch}
              onChangeText={setDriverSearch}
              placeholder="Search driver name..."
              placeholderTextColor={Colors.gray400}
            />
          </View>
          <Card style={{ maxHeight: 120, marginBottom: Spacing.sm }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredDrivers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.pickerItem, overrideDriverId === d.id && styles.pickerItemActive]}
                  onPress={() => setOverrideDriverId(d.id)}
                >
                  <DriverAvatar
                    initials={`${d.first_name[0]}${d.last_name[0]}`}
                    avatarUrl={d.avatar_url || d.photo_url}
                    size={24}
                  />
                  <Text style={styles.pickerItemText}>{d.first_name} {d.last_name}</Text>
                  {overrideDriverId === d.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>

          {/* Primary Vehicle Override */}
          <Text style={styles.fieldLabel}>Primary Vehicle</Text>
          <View style={styles.searchBar}>
            <Search size={14} color={Colors.gray500} />
            <TextInput
              style={styles.searchInput}
              value={vehicleSearch}
              onChangeText={setVehicleSearch}
              placeholder="Search plate or asset type..."
              placeholderTextColor={Colors.gray400}
            />
          </View>
          <Card style={{ maxHeight: 120, marginBottom: Spacing.sm }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filteredVehicles.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.pickerItem, overrideVehicleId === v.id && styles.pickerItemActive]}
                  onPress={() => setOverrideVehicleId(v.id)}
                >
                  <Truck size={16} color={Colors.gray600} />
                  <Text style={styles.pickerItemText}>{v.plate_number} ({v.asset_type})</Text>
                  {overrideVehicleId === v.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>

          {/* Co-Driver Override */}
          <Text style={styles.fieldLabel}>Co-Driver (Optional)</Text>
          <View style={styles.searchBar}>
            <Search size={14} color={Colors.gray500} />
            <TextInput
              style={styles.searchInput}
              value={coDriverSearch}
              onChangeText={setCoDriverSearch}
              placeholder="Search co-driver name..."
              placeholderTextColor={Colors.gray400}
            />
          </View>
          <Card style={{ maxHeight: 120, marginBottom: Spacing.sm }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.pickerItem, !overrideCoDriverId && styles.pickerItemActive]}
                onPress={() => setOverrideCoDriverId('')}
              >
                <Text style={styles.pickerItemText}>No Co-Driver</Text>
                {!overrideCoDriverId && <Check size={16} color={Colors.primary} strokeWidth={3} />}
              </TouchableOpacity>
              {filteredDrivers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.pickerItem, overrideCoDriverId === d.id && styles.pickerItemActive]}
                  onPress={() => setOverrideCoDriverId(d.id)}
                >
                  <DriverAvatar
                    initials={`${d.first_name[0]}${d.last_name[0]}`}
                    avatarUrl={d.avatar_url || d.photo_url}
                    size={24}
                  />
                  <Text style={styles.pickerItemText}>{d.first_name} {d.last_name}</Text>
                  {overrideCoDriverId === d.id && <Check size={16} color={Colors.primary} strokeWidth={3} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>

          {overrideCoDriverId ? (
            <Input
              label="Co-Driver Payout Override (SAR)"
              value={overrideCoDriverPayout}
              onChangeText={setOverrideCoDriverPayout}
              placeholder="Optional (Default: 50/50 split)"
              keyboardType="numeric"
            />
          ) : null}
        </ScrollView>

        <View style={{ gap: 8, marginTop: 12 }}>
          <Button title="Save Day Override" onPress={handleSaveModalOverride} />
          <Button title="Reset to Master Assignment" variant="outline" onPress={handleClearModalOverride} />
        </View>
      </AppModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginVertical: Spacing.sm,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthTitleText: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  shortcutsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  shortcutBtn: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  shortcutBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  clearShortcutBtn: {
    backgroundColor: Colors.gray100,
    borderColor: Colors.gray300,
  },
  clearShortcutText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray700,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    paddingBottom: 4,
    marginBottom: 4,
  },
  weekdayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
  },
  weekendHeaderText: {
    color: Colors.gray400,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyCell: {
    width: '14.28%',
    height: 42,
  },
  dayCell: {
    width: '14.28%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    marginVertical: 1,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayCellOverride: {
    borderWidth: 2,
    borderColor: '#059669',
  },
  dayNumText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray800,
  },
  dayNumTextSelected: {
    color: Colors.white,
    fontWeight: '800',
  },
  indicatorContainer: {
    position: 'absolute',
    bottom: 2,
    alignItems: 'center',
  },
  checkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overrideBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overrideBadgeActive: {
    backgroundColor: '#059669',
  },
  summaryBar: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    gap: 8,
  },
  summaryText: {
    fontSize: Typography.xs,
    fontWeight: '700',
    color: Colors.gray900,
  },
  modeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.lg,
    padding: 2,
  },
  modeSegmentBtn: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  modeSegmentBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modeSegmentText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gray600,
  },
  modeSegmentTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.md,
    fontWeight: '800',
    color: Colors.gray900,
  },
  modalSubtitle: {
    fontSize: Typography.xs,
    color: Colors.gray500,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    height: 34,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: Colors.gray900,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  pickerItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  pickerItemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray800,
  },
});

export default MonthlyCalendarSelector;
