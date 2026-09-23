file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/SettingsScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

content = content.replace("  Volume2,\n  Volume2,", "  Volume2,")

with open(file_path, 'w') as f:
    f.write(content)
