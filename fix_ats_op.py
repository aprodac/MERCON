import re
import os

file_path = 'frontend/mobile-app/operator-app/app.config.ts'
if os.path.exists(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    if 'NSAllowsArbitraryLoads' not in content:
        replacement = """  ios: {
    bundleIdentifier: client.iosBundleIdentifier,
    buildNumber: String(buildNumber),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
  },"""

        content = re.sub(r'  ios: \{[\s\S]*?infoPlist: \{[\s\S]*?\},[\s\S]*?\},', replacement, content)

        with open(file_path, 'w') as f:
            f.write(content)
