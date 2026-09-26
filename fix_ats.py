import re

file_path = 'frontend/mobile-app/driver-app/app.config.ts'
with open(file_path, 'r') as f:
    content = f.read()

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
