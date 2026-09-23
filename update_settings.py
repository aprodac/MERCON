import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/SettingsScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Add Volume2 to imports, remove LogOut
content = content.replace("  MapPin,", "  MapPin,\n  Volume2,")
content = content.replace("  LogOut,\n", "")

# 2. Add soundAlerts state
content = content.replace("  const [locationSharing, setLocationSharing] = React.useState(true);", 
                          "  const [locationSharing, setLocationSharing] = React.useState(true);\n  const [soundAlerts, setSoundAlerts] = React.useState(true);")

# 3. Add Sound Alerts to TOGGLE_ROWS
sound_alert_obj = """    {
      Icon: Volume2,
      labelKey: 'setting_sound_alerts',
      defaultLabel: 'Sound Alerts',
      descKey: 'setting_sound_desc',
      defaultDesc: 'Play audio for navigation & alerts',
      value: soundAlerts,
      onChange: setSoundAlerts,
    },
    {
      Icon: Moon,"""
content = content.replace("    {\n      Icon: Moon,", sound_alert_obj)

# 4. Remove Logout button JSX
logout_pattern = r'\{\/\* Logout \*\/\}.*?<\/TouchableOpacity>'
content = re.sub(logout_pattern, '', content, flags=re.DOTALL)

# 5. Remove unused useAuth
content = content.replace("  const { signOut } = useAuth();\n", "")
content = content.replace("import { useAuth } from '../../lib/auth-context';\n", "")


with open(file_path, 'w') as f:
    f.write(content)
