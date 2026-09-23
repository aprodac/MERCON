import re
import glob

files = [
    'frontend/mobile-app/mercon-app/src/screens/driver/PersonalInfoScreen.tsx',
    'frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx',
    'frontend/mobile-app/mercon-app/src/screens/driver/ChangePasswordScreen.tsx',
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    # Remove {/* ... */} entirely
    content = re.sub(r'\{\s*/\*.*?\*/\s*\}', '', content)
    
    with open(file, 'w') as f:
        f.write(content)

