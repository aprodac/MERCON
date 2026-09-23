import re

file_path = 'frontend/mobile-app/mercon-app/src/screens/driver/HomeScreen.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update timelineDotCol CSS (remove paddingTop)
content = re.sub(
    r'timelineDotCol: \{\n\s*width: 28,\n\s*alignItems: \'center\',\n\s*paddingTop: 14,\n\s*\},',
    r"timelineDotCol: {\n    width: 28,\n    alignItems: 'center',\n  },",
    content
)

# 2. Add lineSegment and lineSegmentHidden CSS
segments_css = """  lineSegment: {
    flex: 1,
    width: 2,
    borderLeftWidth: 2,
    borderColor: '#D8D8DC',
    borderStyle: 'dashed',
    marginVertical: 1,
  },
  lineSegmentHidden: {
    flex: 1,
    width: 2,
  },"""
content = content.replace("  dashedLine: {", segments_css + "\n  dashedLine: {")

# 3. Rewrite the timelineDotCol JSX
old_jsx = """                            <View style={styles.timelineDotCol}>
                              {isFirst ? (
                                <View style={[styles.pickupNodeOuter, { borderColor: dotColor }]}>
                                  <View style={[styles.pickupNodeInner, { backgroundColor: dotColor }]} />
                                </View>
                              ) : (
                                <View style={[
                                  styles.stopNodeDot,
                                  { borderColor: dotColor },
                                  returnLeg && { backgroundColor: dotColor },
                                ]} />
                              )}
                              {!isLast && (
                                <View style={[styles.dashedLine, { borderColor: lineColor, opacity: returnLeg ? 0.4 : 1 }]} />
                              )}
                            </View>"""

new_jsx = """                            <View style={styles.timelineDotCol}>
                              {/* Top half line (connects to previous row) */}
                              {isFirst ? (
                                <View style={styles.lineSegmentHidden} />
                              ) : (
                                <View style={[styles.lineSegment, { borderColor: lineColor, opacity: returnLeg ? 0.4 : 1 }]} />
                              )}

                              {/* The Dot */}
                              {isFirst ? (
                                <View style={[styles.pickupNodeOuter, { borderColor: dotColor }]}>
                                  <View style={[styles.pickupNodeInner, { backgroundColor: dotColor }]} />
                                </View>
                              ) : (
                                <View style={[
                                  styles.stopNodeDot,
                                  { borderColor: dotColor },
                                  returnLeg && { backgroundColor: dotColor },
                                ]} />
                              )}

                              {/* Bottom half line (connects to next row) */}
                              {isLast ? (
                                <View style={styles.lineSegmentHidden} />
                              ) : (
                                <View style={[styles.lineSegment, { borderColor: lineColor, opacity: returnLeg ? 0.4 : 1 }]} />
                              )}
                            </View>"""

content = content.replace(old_jsx, new_jsx)

with open(file_path, 'w') as f:
    f.write(content)
