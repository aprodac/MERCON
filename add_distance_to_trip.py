with open('frontend/mobile-app/mercon-app/src/screens/driver/DriverTripDetailsScreen.tsx', 'r') as f:
    content = f.read()

import re

# Add distance row to scheduleGrid
old_grid = """            <View style={styles.scheduleGrid}>
              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleLabel}>{t('label_planned_start', 'Planned Start')}</Text>"""

new_grid = """            <View style={styles.scheduleGrid}>
              {trip.planned_distance != null && (
                <View style={styles.scheduleRow}>
                  <Text style={styles.scheduleLabel}>{t('label_distance', 'Distance')}</Text>
                  <Text style={[styles.scheduleVal, { writingDirection: 'ltr' }]}>{trip.planned_distance.toLocaleString()} km</Text>
                </View>
              )}
              <View style={styles.scheduleRow}>
                <Text style={styles.scheduleLabel}>{t('label_planned_start', 'Planned Start')}</Text>"""

content = content.replace(old_grid, new_grid)

with open('frontend/mobile-app/mercon-app/src/screens/driver/DriverTripDetailsScreen.tsx', 'w') as f:
    f.write(content)
