import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Fix header height
content = content.replace('<HeaderWaveBg width={SCREEN_WIDTH} height={230} />', '<HeaderWaveBg width={SCREEN_WIDTH} height={300} />')
# also fix in styles
content = content.replace('height: 230,\n    width: \'100%\',', 'height: 300,\n    width: \'100%\',')

# 2. Fix driver name text styling (scale it down a bit, and fix color if needed)
content = content.replace('fontSize: 22,\n    fontWeight: \'700\',\n    color: \'#FFFFFF\',', 'fontSize: 18,\n    fontWeight: \'700\',\n    color: \'#FFFFFF\',')
content = content.replace('fontSize: 14,\n    fontWeight: \'500\',\n    color: \'rgba(255, 255, 255, 0.8)\',', 'fontSize: 13,\n    fontWeight: \'500\',\n    color: \'rgba(255, 255, 255, 0.9)\',')

# 3. Fix Menu Items (icons, strokes, colors)
# We will replace all `#771B1B` with `#881313` and `strokeWidth={2}` with `strokeWidth={1.5}`
content = content.replace('color="#771B1B" strokeWidth={2}', 'color="#9A2A2A" strokeWidth={1.5}')
content = content.replace('color="#A1A1AA"', 'color="#C4C4C8"')

# 4. Make menu items taller for better alignment like the mockup
content = content.replace('paddingVertical: 14,\n    paddingHorizontal: 16,', 'paddingVertical: 16,\n    paddingHorizontal: 18,')
content = content.replace('marginRight: 14,', 'marginRight: 16,')
content = content.replace('fontSize: 15,\n    fontWeight: \'500\',\n    color: \'#3E3C3D\',', 'fontSize: 15,\n    fontWeight: \'500\',\n    color: \'#2D2C2C\',')

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
