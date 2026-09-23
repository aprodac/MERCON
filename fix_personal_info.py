with open('frontend/mobile-app/mercon-app/src/screens/driver/PersonalInfoScreen.tsx', 'r') as f:
    content = f.read()

# Remove the spacer comment and any trailing spaces
content = content.replace("<View style={{ width: 44 }} /> {/* Spacer */}", "<View style={{ width: 44 }} />")

with open('frontend/mobile-app/mercon-app/src/screens/driver/PersonalInfoScreen.tsx', 'w') as f:
    f.write(content)
