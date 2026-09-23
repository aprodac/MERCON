import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/SettingsScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# Remove logoutBtn and logoutText from styles
content = re.sub(r'logoutBtn: \{.*?\},\s*logoutText: \{.*?\},', '', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(content)
