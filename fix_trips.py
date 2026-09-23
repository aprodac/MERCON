import re

file_path = 'frontend/mobile-app/mercon-app/src/lib/trips.ts'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace(
    "case 'ARRIVED_AT_PICKUP':\n      return { label: 'Loading Completed'",
    "case 'ARRIVED_AT_PICKUP':\n    case 'LOADING':\n      return { label: 'Loading Completed'"
)

content = content.replace(
    "case 'IN_TRANSIT':\n      return { label: 'Arrived at Delivery'",
    "case 'IN_TRANSIT':\n    case 'GOING_TO_STOP':\n    case 'ARRIVED_AT_STOP':\n    case 'STOP_VERIFICATION':\n      return { label: 'Arrived at Delivery'"
)

with open(file_path, 'w') as f:
    f.write(content)
