import re

files = [
    'frontend/mobile-app/mercon-app/src/screens/driver/PersonalInfoScreen.tsx',
    'frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx',
    'frontend/mobile-app/mercon-app/src/screens/driver/ChangePasswordScreen.tsx',
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()
    
    # Remove whitespace between tags
    content = re.sub(r'>\s+<', '><', content)
    
    with open(file, 'w') as f:
        f.write(content)

