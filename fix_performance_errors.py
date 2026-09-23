with open('frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx', 'r') as f:
    content = f.read()

import re

# Fix trip_stops to stops, createdAt to actual_end or planned_start
content = content.replace("if (trip.trip_stops && trip.trip_stops.length >= 2) {", "if (trip.stops && trip.stops.length >= 2) {")
content = content.replace("const origin = trip.trip_stops[0].location_name;", "const origin = trip.stops[0]?.location?.name || trip.stops[0]?.location_name || 'Origin';")
content = content.replace("const dest = trip.trip_stops[trip.trip_stops.length - 1].location_name;", "const dest = trip.stops[trip.stops.length - 1]?.location?.name || trip.stops[trip.stops.length - 1]?.location_name || 'Destination';")

content = content.replace("if (trip.createdAt) {", "const d = trip.actual_end || trip.planned_start;\n                if (d) {")
content = content.replace("dateLabel = new Date(trip.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });", "dateLabel = new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });")
content = content.replace("trip.trip_number || trip.id", "trip.ref_id || trip.id")

with open('frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx', 'w') as f:
    f.write(content)
