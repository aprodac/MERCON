import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Remove the top controls bar
top_header_row_pattern = r'\{\/\* Top Controls Bar \*\/\}[\s\S]*?\{\/\* Elegant Driver Identity Column \(Centered\) \*\/\}'
content = re.sub(top_header_row_pattern, '{/* Elegant Driver Identity Column (Centered) */}', content)

# 2. Adjust margins for identityColumn and headerSafe
# Make headerSafe have a bit more top padding since the controls are gone
content = content.replace("  headerSafe: {\n    paddingHorizontal: 16,\n    paddingTop: 6,\n  },", "  headerSafe: {\n    paddingHorizontal: 16,\n    paddingTop: 16,\n  },")

# Remove some paddingBottom from headerContainer so the white area comes up slightly more
content = content.replace("paddingBottom: 24,", "paddingBottom: 16,")

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
