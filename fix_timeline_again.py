import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# Replace returnLegConnector
content = re.sub(
    r'returnLegConnector: \{.*?\},',
    r"returnLegConnector: {\n    width: 2,\n    flex: 1,\n    minHeight: 36,\n    borderLeftWidth: 2,\n    borderColor: '#D8D8DC',\n    borderStyle: 'dashed',\n  },",
    content,
    flags=re.DOTALL
)

# Replace dashedLine
content = re.sub(
    r'dashedLine: \{.*?\},',
    r"dashedLine: {\n    width: 2,\n    flex: 1,\n    borderLeftWidth: 2,\n    borderColor: '#D8D8DC',\n    borderStyle: 'dashed',\n    marginVertical: 4,\n  },",
    content,
    flags=re.DOTALL
)

with open(file_path, 'w') as f:
    f.write(content)
