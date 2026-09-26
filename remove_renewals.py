import re
import os

files = [
    'frontend/mobile-app/operator-app/src/features/more/screens/MoreScreen.tsx',
    'frontend/mobile-app/operator-app/src/components/OperatorSidebarDrawer.tsx'
]

for file_path in files:
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    with open(file_path, 'w') as f:
        for line in lines:
            if 'Vehicle Renewals' not in line:
                f.write(line)

# Delete the files
try:
    os.remove('frontend/mobile-app/operator-app/src/app/vehicle-renewals.tsx')
    os.remove('frontend/mobile-app/operator-app/src/features/vehicles/screens/VehicleRenewalScreen.tsx')
except OSError:
    pass

