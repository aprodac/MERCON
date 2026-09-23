import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/DriverChargesScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# Replace router.push('/trips') with router.push('/trips?tab=Completed')
content = content.replace(
    "router.push('/trips')",
    "router.push('/trips?tab=Completed')"
)

with open(file_path, 'w') as f:
    f.write(content)
