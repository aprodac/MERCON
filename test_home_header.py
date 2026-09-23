import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Let's add extra space if needed. insets.top might be around 47 on newer iPhones.
# Also, maybe wrap the whole screen in a View that has flex: 1 and backgroundColor
