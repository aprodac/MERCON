import DashboardLayout from '@/components/layout/DashboardLayout';
import CargoLoadingView from './CargoLoadingView';

export default function VehicleDetailsPage() {
  return (
    <DashboardLayout active="Vehicles" title="Truck Details">
      <div className="w-full h-full">
        <CargoLoadingView />
      </div>
    </DashboardLayout>
  );
}
