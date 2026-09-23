import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Check } from 'lucide-react-native';
import { Colors, Spacing, Radius, Typography } from '../../theme/tokens';
import { AppModal } from './AppModal';
import { Button } from '../Button';

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string; // DD/MM/YYYY
  onSelectDate: (formattedDate: string) => void;
}

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTime: string; // HH:MM (24-hour format e.g. "08:00")
  onSelectTime: (formattedTime: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  onClose,
  selectedDate,
  onSelectDate,
}) => {
  // Parse initial date from DD/MM/YYYY or default to today
  const initialDateObj = useMemo(() => {
    if (selectedDate && selectedDate.includes('/')) {
      const parts = selectedDate.split('/');
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
          return new Date(y, m, d);
        }
      }
    }
    return new Date();
  }, [selectedDate]);

  const [currentMonth, setCurrentMonth] = useState<Date>(initialDateObj);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthLabel = currentMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  // Calendar Grid Cells
  const cells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const items: Array<{ type: 'empty' | 'day'; dayNum?: number; dateStr?: string }> = [];

    for (let i = 0; i < firstDayIndex; i++) {
      items.push({ type: 'empty' });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const mm = String(month + 1).padStart(2, '0');
      const dateStr = `${dd}/${mm}/${year}`;
      items.push({ type: 'day', dayNum: d, dateStr });
    }

    return items;
  }, [year, month]);

  const todayStr = useMemo(() => {
    const t = new Date();
    const dd = String(t.getDate()).padStart(2, '0');
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${t.getFullYear()}`;
  }, []);

  const tomorrowStr = useMemo(() => {
    const t = new Date(Date.now() + 86400000);
    const dd = String(t.getDate()).padStart(2, '0');
    const mm = String(t.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${t.getFullYear()}`;
  }, []);

  return (
    <AppModal visible={visible} onClose={onClose} type="dialog" title="Select Departure Date">
      {/* Quick Presets */}
      <View style={styles.presetsRow}>
        <TouchableOpacity
          style={[styles.presetChip, selectedDate === todayStr && styles.presetChipActive]}
          onPress={() => {
            onSelectDate(todayStr);
            onClose();
          }}
        >
          <Text style={[styles.presetChipText, selectedDate === todayStr && styles.presetChipTextActive]}>
            Today
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.presetChip, selectedDate === tomorrowStr && styles.presetChipActive]}
          onPress={() => {
            onSelectDate(tomorrowStr);
            onClose();
          }}
        >
          <Text style={[styles.presetChipText, selectedDate === tomorrowStr && styles.presetChipTextActive]}>
            Tomorrow
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month Header Navigation */}
      <View style={styles.monthNavRow}>
        <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
          <ChevronLeft size={20} color={Colors.gray700} />
        </TouchableOpacity>
        <View style={styles.monthTitleContainer}>
          <CalendarIcon size={16} color={Colors.primary} />
          <Text style={styles.monthTitleText}>{monthLabel}</Text>
        </View>
        <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
          <ChevronRight size={20} color={Colors.gray700} />
        </TouchableOpacity>
      </View>

      {/* Weekday Column Headers */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((wd, i) => (
          <Text key={wd} style={[styles.weekdayText, (i === 5 || i === 6) && styles.weekendText]}>
            {wd}
          </Text>
        ))}
      </View>

      {/* Calendar Days Grid */}
      <View style={styles.gridContainer}>
        {cells.map((cell, idx) => {
          if (cell.type === 'empty') {
            return <View key={`empty-${idx}`} style={styles.emptyGridCell} />;
          }

          const isSelected = cell.dateStr === selectedDate;
          const isToday = cell.dateStr === todayStr;

          return (
            <TouchableOpacity
              key={cell.dateStr}
              style={[
                styles.dayGridCell,
                isToday && styles.todayGridCell,
                isSelected && styles.selectedGridCell,
              ]}
              onPress={() => {
                onSelectDate(cell.dateStr!);
                onClose();
              }}
            >
              <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>
                {cell.dayNum}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </AppModal>
  );
};

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  onClose,
  selectedTime,
  onSelectTime,
}) => {
  // Parse initial 24h time e.g. "08:30"
  const { initialHour, initialMinute, initialPeriod } = useMemo(() => {
    let h = 8;
    let m = 0;
    if (selectedTime && selectedTime.includes(':')) {
      const parts = selectedTime.split(':');
      h = parseInt(parts[0], 10) || 8;
      m = parseInt(parts[1], 10) || 0;
    }
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;

    // Round minute to nearest 15
    const roundedM = Math.round(m / 15) * 15;
    return {
      initialHour: h12,
      initialMinute: roundedM >= 60 ? 0 : roundedM,
      initialPeriod: period as 'AM' | 'PM',
    };
  }, [selectedTime]);

  const [hour12, setHour12] = useState<number>(initialHour);
  const [minute, setMinute] = useState<number>(initialMinute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(initialPeriod);

  const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const MINUTES = [0, 15, 30, 45];

  const handleConfirm = () => {
    let h24 = hour12;
    if (period === 'PM' && hour12 < 12) h24 += 12;
    if (period === 'AM' && hour12 === 12) h24 = 0;

    const formattedH = String(h24).padStart(2, '0');
    const formattedM = String(minute).padStart(2, '0');
    onSelectTime(`${formattedH}:${formattedM}`);
    onClose();
  };

  return (
    <AppModal visible={visible} onClose={onClose} type="dialog" title="Select Departure Time">
      <View style={styles.timePickerContainer}>
        {/* AM/PM Segment Toggle */}
        <View style={styles.periodSegment}>
          <TouchableOpacity
            style={[styles.periodBtn, period === 'AM' && styles.periodBtnActive]}
            onPress={() => setPeriod('AM')}
          >
            <Text style={[styles.periodText, period === 'AM' && styles.periodTextActive]}>AM</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodBtn, period === 'PM' && styles.periodBtnActive]}
            onPress={() => setPeriod('PM')}
          >
            <Text style={[styles.periodText, period === 'PM' && styles.periodTextActive]}>PM</Text>
          </TouchableOpacity>
        </View>

        {/* Hour Grid */}
        <Text style={styles.sectionLabel}>Select Hour</Text>
        <View style={styles.hoursGrid}>
          {HOURS.map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.timeChip, hour12 === h && styles.timeChipActive]}
              onPress={() => setHour12(h)}
            >
              <Text style={[styles.timeChipText, hour12 === h && styles.timeChipTextActive]}>
                {String(h).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Minute Selector */}
        <Text style={styles.sectionLabel}>Select Minute</Text>
        <View style={styles.minutesGrid}>
          {MINUTES.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.timeChip, minute === m && styles.timeChipActive]}
              onPress={() => setMinute(m)}
            >
              <Text style={[styles.timeChipText, minute === m && styles.timeChipTextActive]}>
                :{String(m).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Live Selection Summary Pill */}
        <View style={styles.selectedTimePreview}>
          <Clock size={16} color={Colors.primary} />
          <Text style={styles.selectedTimePreviewText}>
            Selected Time: {String(hour12).padStart(2, '0')}:{String(minute).padStart(2, '0')} {period}
          </Text>
        </View>

        <Button title="Apply Departure Time" onPress={handleConfirm} style={{ marginTop: Spacing.sm }} />
      </View>
    </AppModal>
  );
};

const styles = StyleSheet.create({
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  presetChip: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  presetChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray700,
  },
  presetChipTextActive: {
    color: Colors.primary,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  monthTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthTitleText: {
    fontSize: Typography.sm,
    fontWeight: '800',
    color: Colors.gray900,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    paddingBottom: 4,
    marginBottom: 4,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray500,
    textTransform: 'uppercase',
  },
  weekendText: {
    color: Colors.gray400,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyGridCell: {
    width: '14.28%',
    height: 38,
  },
  dayGridCell: {
    width: '14.28%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    marginVertical: 1,
  },
  todayGridCell: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectedGridCell: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray900,
  },
  selectedDayText: {
    color: Colors.white,
    fontWeight: '800',
  },
  timePickerContainer: {
    gap: Spacing.xs,
  },
  periodSegment: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.lg,
    padding: 3,
    marginBottom: Spacing.xs,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  periodBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.gray600,
  },
  periodTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray600,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  hoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  minutesGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  timeChip: {
    flex: 1,
    minWidth: 50,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  timeChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  timeChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray800,
  },
  timeChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  selectedTimePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryLight,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  selectedTimePreviewText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
});
