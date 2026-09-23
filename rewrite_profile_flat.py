import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Update ScrollView & Header styles
content = content.replace("paddingHorizontal: 16,\n    paddingBottom: 95,\n    gap: 14,", "paddingBottom: 95,\n    backgroundColor: '#FFFFFF',")
content = content.replace("marginHorizontal: -16,\n    alignSelf: 'stretch',", "")

# 2. Update menu item structure to include subtitles and circular icon backgrounds
old_menu = """        {/* ── UNIFIED NAVIGATION MENU CARD ── */}
        <View style={styles.menuCard}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <User size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_personal_info', 'Personal Information')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/vehicle' as any)}>
            <Truck size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_assigned_vehicle', 'Assigned Vehicle')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/documents' as any)}>
            <FileText size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_my_documents', 'My Documents')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <Award size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('title_performance_overview', 'Performance Overview')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <Lock size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('action_change_password', 'Change Password')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/settings' as any)}>
            <Settings size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_settings', 'App Settings')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <HelpCircle size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('nav_help_support', 'Help & Support')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
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
            <LogOut size={20} color="#9A2A2A" strokeWidth={1.5} style={styles.menuIcon} />
            <Text style={styles.menuItemText}>{t('action_sign_out', 'Logout')}</Text>
            <ChevronRightIcon size={18} color="#C4C4C8" />
          </TouchableOpacity>
        </View>"""

new_menu = """        {/* ── UNIFIED NAVIGATION MENU LIST ── */}
        <View style={styles.menuListContainer}>
          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0F9EA' }]}>
              <User size={20} color="#65A30D" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_personal_info', 'Personal Information')}</Text>
              <Text style={styles.menuItemSub}>Edit your profile details</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/vehicle' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
              <Truck size={20} color="#DC2626" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_assigned_vehicle', 'Assigned Vehicle')}</Text>
              <Text style={styles.menuItemSub}>View your current vehicle</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/documents' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
              <FileText size={20} color="#2563EB" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_my_documents', 'My Documents')}</Text>
              <Text style={styles.menuItemSub}>Manage uploaded documents</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF9C3' }]}>
              <Award size={20} color="#CA8A04" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
              <Text style={styles.menuItemSub}>View your trip statistics</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
              <Lock size={20} color="#059669" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('action_change_password', 'Change Password')}</Text>
              <Text style={styles.menuItemSub}>Update your security</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => router.push('/settings' as any)}>
            <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
              <Settings size={20} color="#4B5563" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_settings', 'App Settings')}</Text>
              <Text style={styles.menuItemSub}>Language and preferences</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} activeOpacity={0.7} onPress={() => {}}>
            <View style={[styles.iconCircle, { backgroundColor: '#FFF7ED' }]}>
              <HelpCircle size={20} color="#EA580C" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('nav_help_support', 'Help & Support')}</Text>
              <Text style={styles.menuItemSub}>Get assistance from admin</Text>
            </View>
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
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
              <LogOut size={20} color="#DC2626" strokeWidth={1.8} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={styles.menuItemTitle}>{t('action_sign_out', 'Logout')}</Text>
              <Text style={styles.menuItemSub}>Sign out of your account</Text>
            </View>
            <ChevronRightIcon size={18} color="#A1A1AA" />
          </TouchableOpacity>
        </View>"""

content = content.replace(old_menu, new_menu)

# 3. Update styles
old_styles = """  /* Menu Card */
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: -30,
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
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  menuIcon: {
    marginRight: 16,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#2D2C2C',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginHorizontal: 16,
  },"""

new_styles = """  /* Menu List Container (Flat full width) */
  menuListContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    marginTop: -15, /* slight overlap for seamless look */
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 500,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#18181B',
    marginBottom: 2,
  },
  menuItemSub: {
    fontSize: 13,
    color: '#71717A',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginLeft: 84, /* Line starts after icon */
    marginRight: 24,
  },"""

content = content.replace(old_styles, new_styles)

# make sure main container has white background so it looks flat
content = content.replace("backgroundColor: '#EEF1F6',", "backgroundColor: '#FFFFFF',")
# container style
content = content.replace("backgroundColor: '#F7F7F7',", "backgroundColor: '#FFFFFF',")

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)

