with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

old_link = """          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0F9EA' }]}>
              <User size={20} color="#65A30D" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_personal_info', 'Personal Information')}</Text>
              <Text style={styles.menuItemSub}>Edit your profile details</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>"""

new_link = """          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/personal-info' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0F9EA' }]}>
              <User size={20} color="#65A30D" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_personal_info', 'Personal Information')}</Text>
              <Text style={styles.menuItemSub}>View your profile details</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>"""

content = content.replace(old_link, new_link)

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
