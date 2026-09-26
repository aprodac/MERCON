import re

file_path = 'frontend/mobile-app/operator-app/src/features/maintenance/screens/MaintenanceScreen.tsx'
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED'>('ALL');

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    return records.filter((r) => {
      const isCompleted = r.status?.toLowerCase() === 'completed';
      
      if (statusFilter === 'COMPLETED' && !isCompleted) return false;
      if (statusFilter === 'PENDING' && isCompleted) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const plate = (r.vehicle?.plate_number || (r as any).vehicle_plate || '').toLowerCase();
        const type = (r.maintenance_type || '').toLowerCase();
        const desc = (r.description || '').toLowerCase();
        
        if (!plate.includes(q) && !type.includes(q) && !desc.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [records, statusFilter, searchQuery]);"""
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
          placeholder="Search by vehicle plate, type..." 
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start' }}>
          <SegmentControl
            options={[
              { label: 'All', value: 'ALL' },
              { label: 'Pending', value: 'PENDING' },
              { label: 'Completed', value: 'COMPLETED' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </View>
      </View>"""
content = content.replace(header_close, ui_additions)

# 4. Use filteredRecords instead of records in FlatList
content = content.replace("data={records}", "data={filteredRecords}")

with open(file_path, 'w') as f:
    f.write(content)
