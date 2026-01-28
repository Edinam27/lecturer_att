import { useState, useEffect, useCallback } from 'react';
import { pwaService } from '@/lib/pwa';
import { toast } from 'react-hot-toast'; // Assuming react-hot-toast is used, based on package.json

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface AttendanceSubmission {
  scheduleId: string;
  method: 'onsite' | 'virtual';
  remarks?: string;
  latitude?: number;
  longitude?: number;
}

export function useAttendanceLocation() {
  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Check online status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  const getLocation = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setLoading(false);
      return null;
    }

    const getPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });
    };

    try {
      let position: GeolocationPosition;
      
      try {
        // First attempt with high accuracy
        position = await getPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 10000
        });
      } catch (err: any) {
        // If timeout (3) or unavailable (2), try with low accuracy
        if (err.code === 3 || err.code === 2) {
          console.warn('High accuracy location failed, retrying with low accuracy...', err);
          position = await getPosition({
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 10000
          });
        } else {
          throw err;
        }
      }

      const newLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      setLocation(newLocation);
      setLoading(false);
      return newLocation;
    } catch (err: any) {
      console.error('Error getting location:', err);
      let errorMessage = 'Failed to get location';
      
      // Handle GeolocationPositionError codes
      if (err.code === 1) {
        errorMessage = 'Location permission denied. Please allow location access in your browser settings.';
      } else if (err.code === 2) {
        errorMessage = 'Location unavailable. Ensure your device has GPS/Location enabled.';
      } else if (err.code === 3) {
        errorMessage = 'Location request timed out. Please try again.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      return null;
    }
  }, []);

  const submitAttendance = async (data: AttendanceSubmission) => {
    try {
      // If offline, store locally
      if (isOffline) {
        await pwaService.storeOfflineAttendance({
          ...data,
          timestamp: new Date().toISOString()
        });
        toast.success('Offline: Attendance saved locally. Will sync when online.');
        return { success: true, offline: true };
      }

      // If online, submit to API
      const response = await fetch('/api/attendance/take', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit attendance');
      }

      toast.success('Attendance recorded successfully!');
      return { success: true, offline: false, data: result };
    } catch (err: any) {
      console.error('Submission error:', err);
      
      // If network error, try to save offline
      if (err.message === 'Failed to fetch' || !navigator.onLine) {
         setIsOffline(true); // Update state just in case
         await pwaService.storeOfflineAttendance({
          ...data,
          timestamp: new Date().toISOString()
        });
        toast.success('Network Error: Attendance saved locally. Will sync when online.');
        return { success: true, offline: true };
      }

      toast.error(err.message || 'An error occurred');
      return { success: false, error: err.message };
    }
  };

  return {
    location,
    loading,
    error,
    isOffline,
    getLocation,
    submitAttendance
  };
}
