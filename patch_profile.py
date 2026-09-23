import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace("} from 'lucide-react-native';", ", User, HeartPulse, HelpCircle, LogOut, ChevronRight as ChevronRightIcon } from 'lucide-react-native';")

# 2. Update identity JSX
identity_jsx_old = """            {/* Elegant Driver Identity Row */}
            <View style={styles.identityRow}>
              <TouchableOpacity
                style={styles.avatarWrapper}
                activeOpacity={0.85}
                onPress={() => setAvatarZoomed(true)}
              >
                <Avatar initials={initialsOf(name)} imageUri={avatarUrl} size={76} />
              </TouchableOpacity>

              <View style={styles.identityTextCol}>
                <Text style={styles.driverNameText} numberOfLines={1}>{name}</Text>
              </View>
            </View>"""

identity_jsx_new = """            {/* Elegant Driver Identity Column (Centered) */}
            <View style={styles.identityColumn}>
              <TouchableOpacity
                style={styles.avatarWrapper}
                activeOpacity={0.85}
                onPress={() => setAvatarZoomed(true)}
              >
                <Avatar initials={initialsOf(name)} imageUri={avatarUrl} size={84} />
              </TouchableOpacity>
              <Text style={styles.driverNameTextCentered} numberOfLines={1}>{name}</Text>
              <Text style={styles.driverVehicleSubText}>Vehicle: {plateNumber}</Text>
            </View>"""

content = content.replace(identity_jsx_old, identity_jsx_new)

# 3. Add Menu JSX right before Performance Overview
menu_jsx = """        {/* ── NAVIGATION MENU CARD ── */}
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <User size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>Personal Information</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <HeartPulse size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>Emergency Contact</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/settings' as any)}>
            <Settings size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>App Settings</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <HelpCircle size={20} color="#771B1B" strokeWidth={2} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>Help & Support</Text>
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
            <Text style={styles.menuItemText}>Logout</Text>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
        </View>

        {/* ── SECTION A: PERFORMANCE OVERVIEW ── */}"""

content = content.replace('{/* ── SECTION A: PERFORMANCE OVERVIEW ── */}', menu_jsx)

# 4. Remove old signout button
old_signout_jsx = """        {/* Modern Sign Out Button */}
        <TouchableOpacity
          style={styles.signOutBtn}
          activeOpacity={0.8}
          onPress={() => {
            signOut();
            router.replace('/login');
          }}
        >
          <Text style={styles.signOutBtnText}>{t('action_sign_out', 'Sign Out')}</Text>
        </TouchableOpacity>"""
content = content.replace(old_signout_jsx, "")

# 5. Add new styles
new_styles = """
  /* Identity Column */
  identityColumn: {
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  driverNameTextCentered: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
  },
  driverVehicleSubText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  /* Menu Card */
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: -20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIcon: {
    marginRight: 14,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#3E3C3D',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginHorizontal: 16,
  },
"""

content = content.replace("  /* Identity Row */", new_styles + "  /* Identity Row */")

# Write it back
with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
