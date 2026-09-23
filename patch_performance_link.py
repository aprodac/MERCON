with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

old_link = """          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF9C3' }]}>
              <Award size={20} color="#CA8A04" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
              <Text style={styles.menuItemSub}>View your trip statistics</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>"""

new_link = """          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/performance-overview' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF9C3' }]}>
              <Award size={20} color="#CA8A04" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
              <Text style={styles.menuItemSub}>View your trip statistics</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>"""

content = content.replace(old_link, new_link)

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
