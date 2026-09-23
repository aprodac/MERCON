import re

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'r') as f:
    content = f.read()

# 1. Fix headerContainer height to be dynamic
old_header = """  headerContainer: {
    height: 290,
    position: 'relative',
    backgroundColor: '#FA634E',
    overflow: 'hidden',
    
  },"""
new_header = """  headerContainer: {
    position: 'relative',
    backgroundColor: '#FA634E',
    overflow: 'hidden',
    paddingBottom: 24,
  },"""
content = content.replace(old_header, new_header)

# 2. Fix menuListContainer to be perfectly flat and seamlessly connected, with no curved overlay
old_menu_list = """  /* Menu List Container (Flat full width) */
  menuListContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    marginTop: -15, /* slight overlap for seamless look */
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 500,
  },"""
new_menu_list = """  /* Menu List Container (Flat full width) */
  menuListContainer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 32,
    minHeight: 500,
  },"""
content = content.replace(old_menu_list, new_menu_list)

with open('frontend/mobile-app/mercon-app/src/screens/driver/ProfileScreen.tsx', 'w') as f:
    f.write(content)
