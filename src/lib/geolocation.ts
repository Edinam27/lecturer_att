// UPSA Graduate School coordinates (Accra, Ghana)
const UPSA_COORDINATES = {
  latitude: parseFloat(process.env.UPSA_GPS_LATITUDE || '5.6037'),
  longitude: parseFloat(process.env.UPSA_GPS_LONGITUDE || '-0.1870')
}

const UPSA_RADIUS = parseInt(process.env.UPSA_GPS_RADIUS || '300') // meters

export interface Coordinates {
  latitude: number
  longitude: number
}

// Calculate distance between two points using Haversine formula
export function getDistance(point1: Coordinates, point2: Coordinates): number {
  const R = 6371e3; // metres
  const φ1 = point1.latitude * Math.PI/180; // φ, λ in radians
  const φ2 = point2.latitude * Math.PI/180;
  const Δφ = (point2.latitude-point1.latitude) * Math.PI/180;
  const Δλ = (point2.longitude-point1.longitude) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return Math.round(R * c); // in metres
}

export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
  return getDistance(point1, point2)
}

export function isWithinUPSARadius(userCoordinates: Coordinates): boolean {
  const distance = calculateDistance(userCoordinates, UPSA_COORDINATES)
  return distance <= UPSA_RADIUS
}

export function verifyLocationForAttendance(userCoordinates: Coordinates): {
  verified: boolean
  distance: number
  withinRadius: boolean
} {
  const distance = calculateDistance(userCoordinates, UPSA_COORDINATES)
  const withinRadius = distance <= UPSA_RADIUS
  
  return {
    verified: withinRadius,
    distance,
    withinRadius
  }
}

export function getUPSACoordinates(): Coordinates {
  return UPSA_COORDINATES
}

export function getUPSARadius(): number {
  return UPSA_RADIUS
}

// Validate coordinates format
export function isLocationValid(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number, 
  radiusMeters: number
): boolean {
  const distance = getDistance(
    { latitude: lat1, longitude: lon1 }, 
    { latitude: lat2, longitude: lon2 }
  );
  return distance <= radiusMeters;
}