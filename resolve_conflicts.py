import os
import re

def resolve_file(filepath, resolution="dev"):
    with open(filepath, 'r') as f:
        content = f.read()

    # The regex looks for the conflict markers
    pattern = re.compile(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> origin/dev\n', re.DOTALL)

    def replacer(match):
        head_content = match.group(1)
        dev_content = match.group(2)
        if resolution == "dev":
            return dev_content + "\n"
        elif resolution == "head":
            return head_content + "\n"

    new_content = pattern.sub(replacer, content)

    with open(filepath, 'w') as f:
        f.write(new_content)

resolve_file('frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx', 'dev')
resolve_file('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'dev')
