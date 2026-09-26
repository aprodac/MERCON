import re
import os

file_path = 'frontend/mobile-app/operator-app/src/features/dashboard/components/OperatorCommandCenterSection.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace FlatList and CarouselPagination with a .map()
flatlist_pattern = r'<View style=\{\{ gap: 10 \}\}>\s*<FlatList[\s\S]*?/>\s*<CarouselPagination[\s\S]*?/>\s*</View>'
replacement = """<View style={{ gap: 10, paddingBottom: 16 }}>
          {filteredItems.map((item) => (
            <View key={item.id}>
              {renderCardItem({ item })}
            </View>
          ))}
        </View>"""

content = re.sub(flatlist_pattern, replacement, content)

# Replace width: cardWidth with width: '100%'
width_pattern = r'width:\s*cardWidth,'
width_replacement = r'width: \'100%\','

content = re.sub(width_pattern, width_replacement, content)

# Remove unused imports or variables if we want, but TS won't strictly fail if they are unused in JS (React native).
# Let's save the file.
with open(file_path, 'w') as f:
    f.write(content)
