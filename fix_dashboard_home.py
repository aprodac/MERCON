import re

file_path = 'frontend/mobile-app/operator-app/src/features/dashboard/screens/DashboardHomeScreen.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Import useOperatorCommandQueue
content = content.replace("useDashboardSummary, useDelayedDeliveries,\n} from '../hooks';", "useDashboardSummary, useDelayedDeliveries, useOperatorCommandQueue,\n} from '../hooks';")

# 2. Call the hook
hook_call = """  const delayedDeliveries = useDelayedDeliveries();
  const { counts } = useOperatorCommandQueue();"""
content = content.replace("  const delayedDeliveries = useDelayedDeliveries();", hook_call)

# 3. Add Skeleton
skeleton = """          <View className="flex-row gap-3">
            <SkeletonMetricCard />
            <SkeletonMetricCard />
          </View>"""
new_skeleton = """          <View className="flex-col gap-3">
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
            <View className="flex-row gap-3">
              <SkeletonMetricCard />
            </View>
          </View>"""
content = content.replace(skeleton, new_skeleton)

# 4. Add the card
cards = """          <View className="flex-row gap-3">
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
          </View>"""
new_cards = """          <View className="flex-col gap-3">
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
content = content.replace(cards, new_cards)

with open(file_path, 'w') as f:
    f.write(content)
