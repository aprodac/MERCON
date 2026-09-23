import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace(
    "import { SafeAreaView } from 'react-native-safe-area-context';",
    "import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';"
)

content = content.replace(
    "const router = useRouter();",
    "const router = useRouter();\n  const insets = useSafeAreaInsets();"
)

content = content.replace(
    "<SafeAreaView style={styles.headerSafe}>",
    "<View style={[styles.headerSafe, { paddingTop: Math.max(insets.top, 8) }]}>"
)

content = content.replace(
    "</SafeAreaView>\n        </View>\n\n        {/* ── Current Trip Card Section",
    "</View>\n        </View>\n\n        {/* ── Current Trip Card Section"
)

with open(file_path, 'w') as f:
    f.write(content)
