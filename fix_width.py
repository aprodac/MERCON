import re

file_path = 'frontend/mobile-app/operator-app/src/features/dashboard/components/OperatorCommandCenterSection.tsx'
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace("width: \\'100%\\',", "width: '100%',")

with open(file_path, 'w') as f:
    f.write(content)
