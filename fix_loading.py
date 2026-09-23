import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/ExternalAppWorkflowScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

replacement = """  if (loading && !trip) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FA634E" />
      </SafeAreaView>
    );
  }

  return ("""

content = content.replace("  return (\n    <SafeAreaView style={styles.container}", replacement + "\n    <SafeAreaView style={styles.container}")

with open(file_path, 'w') as f:
    f.write(content)
