import re

file_path = 'frontend/mobile-app/operator-app/src/features/documents/screens/DocumentsScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace FlatList import with SectionList, add useMemo
content = content.replace("import React, { useState } from 'react';", "import React, { useState, useMemo } from 'react';")
content = content.replace("FlatList,", "SectionList,")

# Add grouping logic
grouping_logic = """  const [drawerVisible, setDrawerVisible] = useState(false);

  const groupedDocuments = useMemo(() => {
    if (!documents) return [];
    const groups: Record<string, OperatorDocument[]> = {};
    
    documents.forEach(doc => {
      const type = doc.entity_type || 'General';
      if (!groups[type]) groups[type] = [];
      groups[type].push(doc);
    });
    
    return Object.keys(groups).map(key => ({
      title: key,
      data: groups[key]
    })).sort((a, b) => a.title.localeCompare(b.title));
  }, [documents]);"""
content = content.replace("  const [drawerVisible, setDrawerVisible] = useState(false);", grouping_logic)

# Replace FlatList with SectionList
flatlist = """        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No documents found"
                subtitle="Fleet & driver documents will appear here."
                Icon={FolderOpen}
                className="mt-12"
              />
            ) : null
          }
        />"""

sectionlist = """        <SectionList
          sections={groupedDocuments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section: { title } }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 16 }}>
              <FolderOpen size={18} color={Colors.primary} strokeWidth={2.5} />
              <Text style={{ fontSize: Typography.base, fontWeight: '800', color: Colors.gray800 }}>
                {title} Documents
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyState
                title="No documents found"
                subtitle="Fleet & driver documents will appear here."
                Icon={FolderOpen}
                className="mt-12"
              />
            ) : null
          }
        />"""
content = content.replace(flatlist, sectionlist)

with open(file_path, 'w') as f:
    f.write(content)
