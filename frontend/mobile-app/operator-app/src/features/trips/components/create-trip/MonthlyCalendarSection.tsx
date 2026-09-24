import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '@mercon/mobile-shared/theme/tokens';
import { MonthlyCalendarSelector, DayAssignmentOverride } from '../MonthlyCalendarSelector';
import { OperatorDriver, OperatorVehicle } from '../../../../lib/operator';

interface MonthlyCalendarSectionProps {
  selectedMonthlyDates: string[];
  setSelectedMonthlyDates: React.Dispatch<React.SetStateAction<string[]>>;
  monthlyCurrentMonth: Date;
  setMonthlyCurrentMonth: (month: Date) => void;
  monthlyAssignmentMode: 'MASTER' | 'PER_DAY' | 'ROTATION';
  setMonthlyAssignmentMode: (mode: 'MASTER' | 'PER_DAY' | 'ROTATION') => void;
  rotationCount?: 2 | 3 | 4;
  onRotationCountChange?: (count: 2 | 3 | 4) => void;
  rotationDrivers?: string[];
  rotationVehicles?: string[];
  onUpdateRotationDriver?: (slotIdx: number, driverId: string) => void;
  onUpdateRotationVehicle?: (slotIdx: number, vehicleId: string) => void;
  onDuplicateFirstDayToAll?: () => void;
  dayAssignments: Record<string, DayAssignmentOverride>;
  setDayAssignments: React.Dispatch<React.SetStateAction<Record<string, DayAssignmentOverride>>>;
  drivers: OperatorDriver[];
  vehicles: OperatorVehicle[];
}

export const MonthlyCalendarSection: React.FC<MonthlyCalendarSectionProps> = ({
  selectedMonthlyDates,
  setSelectedMonthlyDates,
  monthlyCurrentMonth,
  setMonthlyCurrentMonth,
  monthlyAssignmentMode,
  setMonthlyAssignmentMode,
  rotationCount,
  onRotationCountChange,
  rotationDrivers,
  rotationVehicles,
  onUpdateRotationDriver,
  onUpdateRotationVehicle,
  onDuplicateFirstDayToAll,
  dayAssignments,
  setDayAssignments,
  drivers,
  vehicles,
}) => {
  const handleToggleDate = (dStr: string) => {
    setSelectedMonthlyDates((prev) =>
      prev.includes(dStr) ? prev.filter((d) => d !== dStr) : [...prev, dStr]
    );
  };

  const handleSelectAllWeekdays = () => {
    const year = monthlyCurrentMonth.getFullYear();
    const month = monthlyCurrentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const weekdays: string[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(year, month, d);
      const dayOfWeek = dt.getDay();
      // Sun-Thu in KSA (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu)
      if (dayOfWeek >= 0 && dayOfWeek <= 4) {
        const dd = String(d).padStart(2, '0');
        const mm = String(month + 1).padStart(2, '0');
        weekdays.push(`${year}-${mm}-${dd}`);
      }
    }
    setSelectedMonthlyDates(weekdays);
  };

  const handleSelectAllDays = () => {
    const year = monthlyCurrentMonth.getFullYear();
    const month = monthlyCurrentMonth.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const allDays: string[] = [];

    for (let d = 1; d <= totalDays; d++) {
      const dd = String(d).padStart(2, '0');
      const mm = String(month + 1).padStart(2, '0');
      allDays.push(`${year}-${mm}-${dd}`);
    }
    setSelectedMonthlyDates(allDays);
  };

  const handleClearAll = () => {
    setSelectedMonthlyDates([]);
  };

  return (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>4. Monthly Duty Schedule</Text>
      <MonthlyCalendarSelector
        selectedDates={selectedMonthlyDates}
        onToggleDate={handleToggleDate}
        onSelectAllWeekdays={handleSelectAllWeekdays}
        onSelectAllDays={handleSelectAllDays}
        onClearAll={handleClearAll}
        currentMonth={monthlyCurrentMonth}
        onMonthChange={setMonthlyCurrentMonth}
        assignmentMode={monthlyAssignmentMode}
        onToggleAssignmentMode={setMonthlyAssignmentMode}
        rotationCount={rotationCount}
        onRotationCountChange={onRotationCountChange}
        rotationDrivers={rotationDrivers}
        rotationVehicles={rotationVehicles}
        onUpdateRotationDriver={onUpdateRotationDriver}
        onUpdateRotationVehicle={onUpdateRotationVehicle}
        onDuplicateFirstDayToAll={onDuplicateFirstDayToAll}
        dayAssignments={dayAssignments}
        onSaveDayOverride={(dateStr: string, override: DayAssignmentOverride | null) => {
          setDayAssignments((prev) => {
            const next = { ...prev };
            if (override) {
              next[dateStr] = override;
            } else {
              delete next[dateStr];
            }
            return next;
          });
        }}
        drivers={drivers}
        vehicles={vehicles}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.headingS.fontSize,
    fontWeight: Typography.headingS.fontWeight,
    color: Colors.charcoal,
    marginBottom: Spacing.xs,
  },
});
