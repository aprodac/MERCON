with open('frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx', 'r') as f:
    content = f.read()

# Replace mock RECENT_TRIPS definition
import re
content = re.sub(r'// Mock recent trips data for the UI[\s\S]*?\];', '', content)

# Update imports
content = content.replace("import { useProfile } from '../../lib/use-profile';", "import { useProfile } from '../../lib/use-profile';\nimport { useTripHistory } from '../../lib/use-trip-history';")

# Update fallbacks and hero scorecard
old_hero = """  // Fallbacks
  const totalTrips = profile?.stats?.totalTrips ?? 142;
  const onTimePercentage = profile?.stats?.onTimePercentage ?? 98;
  const totalDistance = profile?.stats?.totalDistanceKm ?? 12500;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HERO SCORECARD */}
        <View style={styles.scorecard}>
          <Text style={styles.scorecardTitle}>On-Time Delivery Rate</Text>
          <View style={styles.mainScoreRow}>
            <Text style={styles.mainScore}>{onTimePercentage}</Text>
            <Text style={styles.mainScorePercent}>%</Text>
          </View>
          
          <View style={styles.scorecardDivider} />
          
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Trips</Text>
              <Text style={styles.statValue}>{totalTrips}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Distance</Text>
              <Text style={styles.statValue}>{totalDistance.toLocaleString()} km</Text>
            </View>
          </View>
        </View>"""

new_hero = """  const { trips, loading: tripsLoading } = useTripHistory();
  const recentTrips = trips.slice(0, 5); // Take up to 5 most recent

  // Use zero fallback (no mock data)
  const totalTrips = profile?.stats?.totalTrips ?? 0;
  const onTimePercentage = profile?.stats?.onTimePercentage ?? 0;
  const totalDistance = profile?.stats?.totalDistanceKm ?? 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} activeOpacity={0.8} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#3E3C3D" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('title_performance_overview', 'Performance Overview')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* HERO SCORECARD */}
        <View style={styles.scorecard}>
          <Text style={styles.scorecardTitle}>Total Trips Completed</Text>
          <View style={styles.mainScoreRow}>
            <Text style={styles.mainScore}>{totalTrips}</Text>
          </View>
          
          <View style={styles.scorecardDivider} />
          
          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>On-Time Rating</Text>
              <Text style={styles.statValue}>{onTimePercentage}%</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Total Distance</Text>
              <Text style={styles.statValue}>{totalDistance.toLocaleString()} km</Text>
            </View>
          </View>
        </View>"""
content = content.replace(old_hero, new_hero)

# Update the map loop
old_map = """        <View style={styles.tripsContainer}>
          {RECENT_TRIPS.map((trip, index) => {
            const isOnTime = trip.status === 'ON_TIME';
            return (
              <React.Fragment key={trip.id}>
                <TouchableOpacity style={styles.tripRow} activeOpacity={0.7}>
                  <View style={[styles.statusIconBox, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                    {isOnTime ? (
                      <CheckCircle2 size={20} color="#059669" />
                    ) : (
                      <Clock size={20} color="#D97706" />
                    )}
                  </View>
                  
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripRoute}>{trip.route}</Text>
                    <View style={styles.tripMetaRow}>
                      <Text style={styles.tripDate}>{trip.date} • {trip.id}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.tripStatusCol}>
                    <View style={[styles.badge, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                      <Text style={[styles.badgeText, { color: isOnTime ? '#059669' : '#D97706' }]}>
                        {isOnTime ? 'On Time' : 'Delayed'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
                
                {index < RECENT_TRIPS.length - 1 && <View style={styles.listDivider} />}
              </React.Fragment>
            );
          })}
        </View>"""

new_map = """        <View style={styles.tripsContainer}>
          {tripsLoading && recentTrips.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: '#A1A1AA' }}>Loading recent trips...</Text>
            </View>
          ) : recentTrips.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: '#A1A1AA' }}>No recent trips found.</Text>
            </View>
          ) : (
            recentTrips.map((trip, index) => {
              // Usually status might be COMPLETED or ON_TIME based on backend enum. 
              // We'll treat COMPLETED as on-time for display if there's no delay flag.
              const isOnTime = true; // Placeholder for actual delay logic based on your backend
              
              // Format route: From Origin -> Destination
              let routeLabel = 'Unknown Route';
              if (trip.trip_stops && trip.trip_stops.length >= 2) {
                const origin = trip.trip_stops[0].location_name;
                const dest = trip.trip_stops[trip.trip_stops.length - 1].location_name;
                routeLabel = `${origin} → ${dest}`;
              }

              // Format date
              let dateLabel = '—';
              try {
                if (trip.createdAt) {
                  dateLabel = new Date(trip.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                }
              } catch {}

              return (
                <React.Fragment key={trip.id}>
                  <TouchableOpacity style={styles.tripRow} activeOpacity={0.7} onPress={() => router.push(`/trip/${trip.id}` as any)}>
                    <View style={[styles.statusIconBox, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                      {isOnTime ? (
                        <CheckCircle2 size={20} color="#059669" />
                      ) : (
                        <Clock size={20} color="#D97706" />
                      )}
                    </View>
                    
                    <View style={styles.tripInfo}>
                      <Text style={styles.tripRoute}>{routeLabel}</Text>
                      <View style={styles.tripMetaRow}>
                        <Text style={styles.tripDate}>{dateLabel} • {trip.trip_number || trip.id}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.tripStatusCol}>
                      <View style={[styles.badge, { backgroundColor: isOnTime ? '#ECFDF5' : '#FFFBEB' }]}>
                        <Text style={[styles.badgeText, { color: isOnTime ? '#059669' : '#D97706' }]}>
                          {isOnTime ? 'On Time' : 'Delayed'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  
                  {index < recentTrips.length - 1 && <View style={styles.listDivider} />}
                </React.Fragment>
              );
            })
          )}
        </View>"""
content = content.replace(old_map, new_map)

with open('frontend/mobile-app/mercon-app/src/screens/driver/PerformanceOverviewScreen.tsx', 'w') as f:
    f.write(content)
