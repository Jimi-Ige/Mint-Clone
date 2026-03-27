import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 bg-amber-500 text-white text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 z-50 shadow-md">
      <WifiOff className="w-4 h-4" />
      You're offline. Some features may be unavailable.
    </div>
  );
}
