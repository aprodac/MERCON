import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/TripsScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# Import useLocalSearchParams
content = content.replace(
    "import { useRouter, useFocusEffect } from 'expo-router';",
    "import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';"
)

# Update state initialization and add effect
old_state = "const [selectedTab, setSelectedTab] = useState<Tab>('Scheduled');"

new_state = """const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [selectedTab, setSelectedTab] = useState<Tab>(tab === 'Completed' ? 'Completed' : 'Scheduled');

  React.useEffect(() => {
    if (tab === 'Completed' || tab === 'Scheduled') {
      setSelectedTab(tab);
    }
  }, [tab]);"""

content = content.replace(old_state, new_state)

with open(file_path, 'w') as f:
    f.write(content)
