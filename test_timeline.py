import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

print("Found timelineRow:", "timelineRow" in content)
print("Found routeRowItem:", "routeRowItem" in content)
