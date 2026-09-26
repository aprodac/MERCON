import re

file_path = 'frontend/mobile-app/operator-app/src/features/dashboard/screens/DashboardHomeScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# Replace Skeleton
skeleton = """          <View className="flex-col gap-3">
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
            </View>
          </View>"""
new_skeleton = """          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
            <View style={{ width: 160 }}><SkeletonMetricCard /></View>
            <View style={{ width: 140 }}><SkeletonMetricCard /></View>
            <View style={{ width: 140 }}><SkeletonMetricCard /></View>
          </ScrollView>"""
content = content.replace(skeleton, new_skeleton)

# Replace Cards
cards = """          <View className="flex-col gap-3">
            <View className="flex-row gap-3">
              <DashboardMetricCard
                title="Active Trips"
                value={activeTrips.data?.length ?? 0}
                image={require('@/assets/images/mobile-truck.webp')}
                onPress={() => router.push('/trips')}
              />
              <DashboardMetricCard
                title="Delayed Deliveries"
                value={delayedDeliveries.data?.length ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
            <View className="flex-row gap-3">
              <DashboardMetricCard
                title="POD Pending"
                value={counts.pod ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
          </View>"""
new_cards = """          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
            <View style={{ width: 160 }}>
              <DashboardMetricCard
                title="Active Trips"
                value={activeTrips.data?.length ?? 0}
                image={require('@/assets/images/mobile-truck.webp')}
                onPress={() => router.push('/trips')}
              />
            </View>
            <View style={{ width: 140 }}>
              <DashboardMetricCard
                title="Delayed Deliveries"
                value={delayedDeliveries.data?.length ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
            <View style={{ width: 140 }}>
              <DashboardMetricCard
                title="POD Pending"
                value={counts.pod ?? 0}
                onPress={() => router.push('/trips')}
              />
            </View>
          </ScrollView>"""
content = content.replace(cards, new_cards)

with open(file_path, 'w') as f:
    f.write(content)
