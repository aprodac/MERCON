import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Update the menu card section to include the new items and remove the negative margin
menu_jsx_new = """        {/* ── UNIFIED NAVIGATION MENU CARD ── */}
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <User size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_personal_info', 'Personal Information')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/vehicle' as any)}>
            <Truck size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_assigned_vehicle', 'Assigned Vehicle')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/documents' as any)}>
            <FileText size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_my_documents', 'My Documents')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <Award size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_performance_overview', 'Performance Overview')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <Lock size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('action_change_password', 'Change Password')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/settings' as any)}>
            <Settings size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_settings', 'App Settings')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <HelpCircle size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_help_support', 'Help & Support')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity 
            style={styles.menuItem} 
            activeOpacity={0.7} 
            onPress={() => {
              signOut();
              router.replace('/login');
            }}
          >
            <LogOut size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('action_sign_out', 'Logout')}</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
        </View>
      </ScrollView>"""

# We need to replace everything from "        {/* ── NAVIGATION MENU CARD ── */}" 
# all the way down to "</ScrollView>" with this new unified menu block.
start_idx = content.find("        {/* ── NAVIGATION MENU CARD ── */}")
end_idx = content.find("      </ScrollView>") + len("      </ScrollView>")

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + menu_jsx_new + content[end_idx:]

# 2. Fix the menuCard style to remove negative margin and adjust spacing
content = content.replace("marginTop: -20,", "marginTop: 20,")

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
