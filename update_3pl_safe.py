import re

file_path = 'frontend/mobile-app/operator-app/src/features/third-party/screens/ThirdPartyScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add imports for useMemo, SearchBar, SegmentControl
if "useMemo" not in content:
    content = content.replace("import React, { useState } from 'react';", "import React, { useState, useMemo } from 'react';")

import_additions = """import { SearchBar } from '@/features/dashboard/components/SearchBar';
import { SegmentControl } from '@/features/dashboard/components/SegmentControl';"""
content = content.replace("import { OperatorSidebarDrawer } from '@/components/OperatorSidebarDrawer';", f"import {{ OperatorSidebarDrawer }} from '@/components/OperatorSidebarDrawer';\n{import_additions}")

# 2. Add state and filtering logic inside component
state_additions = """  const [drawerVisible, setDrawerVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const filteredProviders = useMemo(() => {
    if (!providers) return [];
    return providers.filter((p) => {
      const isActive = p.isActive ?? true;
      if (statusFilter === 'ACTIVE' && !isActive) return false;
      if (statusFilter === 'INACTIVE' && isActive) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = p.name?.toLowerCase().includes(q);
        const matchPerson = p.contact_person?.toLowerCase().includes(q);
        const matchPhone = p.phone?.toLowerCase().includes(q);
        if (!matchName && !matchPerson && !matchPhone) return false;
      }
      return true;
    });
  }, [providers, statusFilter, searchQuery]);"""
content = content.replace("  const [drawerVisible, setDrawerVisible] = useState(false);", state_additions)

# 3. Add UI elements below the Header
header_close = """        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          activeOpacity={0.75}
          style={{ width: 38, height: 38, borderRadius: Radius.md, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' }}
        >
          <Menu size={20} color={Colors.gray800} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>"""

ui_additions = header_close + """

      {/* Filter and Search Bar */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.gray100 }}>
        <SearchBar 
          value={searchQuery} 
          onChangeText={setSearchQuery} 
          placeholder="Search by name, phone..." 
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
          <SegmentControl
            options={[
              { label: 'All', value: 'ALL' },
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Inactive', value: 'INACTIVE' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </View>
      </View>"""
content = content.replace(header_close, ui_additions)

# 4. Use filteredProviders instead of providers in FlatList
content = content.replace("data={providers}", "data={filteredProviders}")

with open(file_path, 'w') as f:
    f.write(content)
